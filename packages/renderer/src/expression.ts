import type {ConditionExpr, ValueExpr} from './schema';

/**
 * Evaluation context passed through conditions, value lookups, and props.
 *
 * We keep the shape intentionally loose so adopters can project their own
 * data under any of the roots (state/props/flags/env/item).
 */
export interface EvalContext {
  state?: Record<string, unknown>;
  props?: Record<string, unknown>;
  flags?: Record<string, unknown>;
  env?: Record<string, unknown>;
  item?: unknown;
  data?: Record<string, unknown>;
}

const ROOTS: Array<keyof EvalContext> = ['state', 'props', 'flags', 'env', 'item', 'data'];

export function resolveValue(expr: ValueExpr, ctx: EvalContext): unknown {
  if (expr === null || typeof expr !== 'object') return expr;
  if ('$literal' in expr) return expr.$literal;
  if ('$' in expr) return lookupPath(expr.$, ctx);
  return expr;
}

export function lookupPath(path: string, ctx: EvalContext): unknown {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return undefined;
  const [head, ...rest] = parts;
  let current: unknown;
  if ((ROOTS as string[]).includes(head)) {
    current = ctx[head as keyof EvalContext];
  } else {
    // Allow implicit lookup on state (common case).
    current = ctx.state?.[head];
    if (current === undefined) current = ctx.data?.[head];
  }
  for (const segment of rest) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function evaluateCondition(expr: ConditionExpr | undefined, ctx: EvalContext): boolean {
  if (expr === undefined) return true;
  if (typeof expr === 'boolean') return expr;
  if ('and' in expr) return expr.and.every(c => evaluateCondition(c, ctx));
  if ('or' in expr) return expr.or.some(c => evaluateCondition(c, ctx));
  if ('not' in expr) return !evaluateCondition(expr.not, ctx);
  if ('eq' in expr) return deepEqual(resolveValue(expr.eq[0], ctx), resolveValue(expr.eq[1], ctx));
  if ('neq' in expr) return !deepEqual(resolveValue(expr.neq[0], ctx), resolveValue(expr.neq[1], ctx));
  if ('gt' in expr) return compareNumbers(resolveValue(expr.gt[0], ctx), resolveValue(expr.gt[1], ctx), '>');
  if ('gte' in expr) return compareNumbers(resolveValue(expr.gte[0], ctx), resolveValue(expr.gte[1], ctx), '>=');
  if ('lt' in expr) return compareNumbers(resolveValue(expr.lt[0], ctx), resolveValue(expr.lt[1], ctx), '<');
  if ('lte' in expr) return compareNumbers(resolveValue(expr.lte[0], ctx), resolveValue(expr.lte[1], ctx), '<=');
  if ('exists' in expr) {
    const v = resolveValue(expr.exists, ctx);
    return v !== undefined && v !== null;
  }
  return false;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((x, i) => deepEqual(x, b[i]));
    }
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function compareNumbers(a: unknown, b: unknown, op: '>' | '>=' | '<' | '<='): boolean {
  const an = Number(a);
  const bn = Number(b);
  if (Number.isNaN(an) || Number.isNaN(bn)) return false;
  switch (op) {
    case '>':
      return an > bn;
    case '>=':
      return an >= bn;
    case '<':
      return an < bn;
    case '<=':
      return an <= bn;
  }
}

/**
 * Recursively resolve `{$: "..."}` / `{$literal: ...}` inside a props object.
 * Plain values pass through untouched.
 */
export function evaluateProps(input: unknown, ctx: EvalContext): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(v => evaluateProps(v, ctx));
  const obj = input as Record<string, unknown>;
  if ('$' in obj && typeof obj.$ === 'string' && Object.keys(obj).length === 1) {
    return lookupPath(obj.$, ctx);
  }
  if ('$literal' in obj && Object.keys(obj).length === 1) {
    return obj.$literal;
  }
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    next[k] = evaluateProps(v, ctx);
  }
  return next;
}
