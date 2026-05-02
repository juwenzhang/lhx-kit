/**
 * Page schema v1 — **types only**.
 *
 * This file is deliberately free of any runtime imports (no `zod`, no
 * helpers) so that importing `@lhx-kit/renderer`'s types does not pull
 * zod into the client bundle. The actual zod validators live in
 * `./schema-zod.ts` and are reached via a dynamic `import()` inside the
 * binding's `options.validate` path — bundlers can then tree-shake the
 * entire validation chain when the consumer doesn't opt in.
 *
 * A page schema describes a component tree to render. Components are keyed by
 * a registry name (e.g. `home.BannerCard`), may declare a visibility condition,
 * a `for` loop expansion, event bindings, props, children, and slots.
 *
 * Design principles:
 * - Declarative and serializable: every node is plain JSON (no functions).
 * - Stable identity for merges: `id` is optional but recommended.
 * - Extensible: unknown fields are stripped by default; `version` allows
 *   future schema versioning without breaking old payloads.
 */

/* ---------------- Expression DSL ---------------- */

/**
 * Condition expression. Evaluated against a context `{state, props, flags, env, item?}`
 * at render time. Extremely small by design — if you need more logic, author
 * a custom component.
 */
export type ConditionExpr =
  | boolean
  | {eq: [ValueExpr, ValueExpr]}
  | {neq: [ValueExpr, ValueExpr]}
  | {gt: [ValueExpr, ValueExpr]}
  | {gte: [ValueExpr, ValueExpr]}
  | {lt: [ValueExpr, ValueExpr]}
  | {lte: [ValueExpr, ValueExpr]}
  | {exists: ValueExpr}
  | {and: ConditionExpr[]}
  | {or: ConditionExpr[]}
  | {not: ConditionExpr};

/**
 * Value expression. Either a literal or a path lookup on the evaluation context.
 * Path syntax: `state.user.id`, `flags.isReview`, `props.title`, `item.name`,
 * `env.mode`. The first segment selects the root.
 */
export type ValueExpr =
  | string
  | number
  | boolean
  | null
  | {$: string} // path lookup
  | {$literal?: unknown}; // explicit literal (escape hatch for strings starting with "$")

/**
 * Action expression attached to events (onClick, onChange, etc.).
 * The renderer binds event handlers that dispatch an action object to the
 * application's action registry. Applications register handlers via the
 * `actions` option passed to `createConfiguredPage`.
 */
export type ActionExpr =
  | {type: string; payload?: Record<string, ValueExpr>}
  | Array<{type: string; payload?: Record<string, ValueExpr>}>;

/* ---------------- Component schema ---------------- */

export interface ComponentSchema {
  /** Registry key; how the renderer resolves an implementation. */
  name: string;
  /** Stable identifier used by merge patches (`target.id`). */
  id?: string;
  /** Raw props (may contain ValueExpr refs inside nested objects — see evaluateProps). */
  props?: Record<string, unknown>;
  /** Child components rendered under the default slot. */
  children?: ComponentSchema[];
  /** Named slots: `{slotName: ComponentSchema[]}`. */
  slots?: Record<string, ComponentSchema[]>;
  /** Visibility condition. Absent/true = visible. */
  when?: ConditionExpr;
  /** v-for / map expansion. `in` points to an array on context; `as` names the item (default `item`). */
  for?: {in: ValueExpr; as?: string};
  /** Event handler bindings: `{eventName: action}`. */
  events?: Record<string, ActionExpr>;
  /** Slot name this node should be placed into when it's a child of a slot-aware parent. */
  slot?: string;
}

/* ---------------- Page schema ---------------- */

export interface PageSchema {
  version: 1;
  /** Schema identifier (not the page name). Useful for debugging/analytics. */
  name: string;
  components: ComponentSchema[];
}

/* ---------------- Schema patches (merge) ---------------- */

export type SchemaPatchOp = 'append' | 'prepend' | 'replace' | 'remove' | 'patchProps';

export interface SchemaPatch {
  op: SchemaPatchOp;
  target: SchemaPatchTarget;
  /** Payload required for append/prepend/replace/patchProps; ignored for remove. */
  value?: ComponentSchema | Record<string, unknown>;
  /** For append/prepend with a slot-aware target: put the new child into this slot. */
  slot?: string;
}

export type SchemaPatchTarget =
  | {id: string}
  | {name: string}
  /** Path of component indexes from root; e.g. [0, 2, 1] → components[0].children[2].children[1] */
  | {path: number[]};

/* ---------------- Variants ---------------- */

export interface VariantEntry {
  /** Boolean condition over an evaluation context. Omit to make the entry always match (fallback). */
  when?: ConditionExpr;
  /** Base schema selected when this variant matches. */
  use: PageSchema;
  /** Optional patches applied on top of `use` for this variant. */
  with?: SchemaPatch[];
}

export type VariantList = VariantEntry[];

/* ---------------- Diagnostic shape shared with application code ---------------- */

export interface RendererDiagnostic {
  level: 'error' | 'warn' | 'info';
  code: string;
  message: string;
  path?: (string | number)[];
  source?: string;
}
