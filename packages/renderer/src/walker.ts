import {type EvalContext, evaluateCondition, evaluateProps, resolveValue} from './expression';
import type {ActionExpr, ComponentSchema, ValueExpr} from './schema';

/**
 * A unit of rendering work, framework-agnostic. Each visible component becomes
 * one or more `RenderNode` instances (multiple when `for` expansion is used).
 */
export interface RenderNode {
  name: string;
  /** Stable-ish key; the walker composes ids, loop indices, etc. */
  key: string;
  /** Evaluated props (after `evaluateProps`). */
  props: Record<string, unknown>;
  /** Children in default slot. */
  children: RenderNode[];
  /** Named slots. */
  slots: Record<string, RenderNode[]>;
  /** Event handler bindings (raw action expressions; framework wrapper dispatches). */
  events: Record<string, ActionExpr>;
  /** Original schema for consumers that need deeper introspection. */
  source: ComponentSchema;
}

/**
 * Turn a schema's `components` list into a list of render-ready nodes.
 *
 * Applies: `when` (visibility), `for` (expansion), `props` evaluation, and
 * recursion through children and slots. Event wiring is left to the framework
 * binding so that Vue/React can build their native handler shape.
 */
export function walkComponents(list: ComponentSchema[] | undefined, ctx: EvalContext, keyPrefix = ''): RenderNode[] {
  if (!list) return [];
  const out: RenderNode[] = [];
  list.forEach((node, index) => {
    if (!evaluateCondition(node.when, ctx)) return;

    if (node.for) {
      const listValue = resolveValue(node.for.in as ValueExpr, ctx);
      if (!Array.isArray(listValue)) return;
      const name = node.for.as ?? 'item';
      listValue.forEach((item, i) => {
        const childCtx: EvalContext = {...ctx, [name]: item} as EvalContext;
        if (name === 'item') childCtx.item = item;
        out.push(renderSingle(node, childCtx, `${keyPrefix}${node.id ?? node.name}:${index}:${i}`));
      });
      return;
    }

    out.push(renderSingle(node, ctx, `${keyPrefix}${node.id ?? node.name}:${index}`));
  });
  return out;
}

function renderSingle(node: ComponentSchema, ctx: EvalContext, key: string): RenderNode {
  const evaluatedProps = (node.props ? (evaluateProps(node.props, ctx) as Record<string, unknown>) : {}) ?? {};
  const slots: Record<string, RenderNode[]> = {};
  if (node.slots) {
    for (const [name, children] of Object.entries(node.slots)) {
      slots[name] = walkComponents(children, ctx, `${key}.slot(${name}).`);
    }
  }
  return {
    name: node.name,
    key,
    props: evaluatedProps,
    children: walkComponents(node.children, ctx, `${key}.`),
    slots,
    events: node.events ?? {},
    source: node
  };
}

/**
 * Helper: dispatch an action (or action list) by looking the type up in a map.
 * Vue/React bindings call this on each bound event.
 */
export function dispatchAction(
  expr: ActionExpr,
  actions: Record<string, (payload: Record<string, unknown>, ctx: EvalContext) => void>,
  ctx: EvalContext
): void {
  const list = Array.isArray(expr) ? expr : [expr];
  for (const step of list) {
    const handler = actions[step.type];
    if (!handler) continue;
    const payload = step.payload
      ? Object.fromEntries(Object.entries(step.payload).map(([k, v]) => [k, resolveValue(v, ctx)]))
      : {};
    handler(payload as Record<string, unknown>, ctx);
  }
}
