import {
  type Component,
  type DefineComponent,
  type VNode,
  computed,
  defineAsyncComponent,
  defineComponent,
  h,
  onMounted,
  ref,
  shallowRef
} from 'vue';
import type {EvalContext} from './expression';
import {mergeSchema} from './merge';
import type {Registry} from './registry';
import {type RemoteFetchOptions, fetchRemoteSchema} from './remote';
import type {ActionExpr, PageSchema, RendererDiagnostic, SchemaPatch, VariantList} from './schema';
import {resolveVariant} from './variant';
import {type RenderNode, dispatchAction, walkComponents} from './walker';

export interface VueRendererOptions {
  /** Default schema (used when no variants supplied and no remote). */
  schema?: PageSchema;
  /** Optional variants; first match provides `base` + `with` patches. */
  variants?: VariantList;
  /** Component registry. Sync loaders are wrapped with defineAsyncComponent. */
  registry: Registry<Component | string>;
  /** Additional schema patches applied after the variant's patches and remote merge. */
  patches?: SchemaPatch[];
  /** Fetch a remote schema URL; result is merged over the variant/base schema. */
  remote?: Omit<RemoteFetchOptions, 'fallback' | 'onDiagnostic'>;
  /** Evaluation context roots forwarded to walker / conditions. */
  state?: Record<string, unknown>;
  flags?: Record<string, unknown>;
  env?: Record<string, unknown>;
  data?: Record<string, unknown>;
  /** Action handlers keyed by action `type`. */
  actions?: Record<string, (payload: Record<string, unknown>, ctx: EvalContext) => void>;
  /** Fallback native element (string tag) used when a component is missing. Default `'div'`. */
  fallbackTag?: string;
  /** Receives diagnostics. */
  onDiagnostic?: (d: RendererDiagnostic) => void;
  /**
   * Runtime-validate the base schema with zod before rendering.
   *
   * Default: `false`. Static JSON schemas imported at build time are
   * already TS-checked via the `PageSchema` type; running zod on them
   * bloats the client bundle by ~50KB. Turn this on only when you pass
   * an `options.remote.url` (remote payloads are always validated
   * regardless of this flag) or when you explicitly want defensive
   * parsing of user-authored schemas.
   */
  validate?: boolean;
}

/**
 * Create a Vue component that renders a page from a config-driven schema.
 *
 * Flow:
 *   1. Pick base schema: variants.resolveVariant(ctx) ?? options.schema.
 *   2. Merge with variant.with.
 *   3. If remote is configured, fetch and merge over.
 *   4. Merge options.patches last.
 *   5. Walk + render.
 */
export function createConfiguredPage(options: VueRendererOptions): DefineComponent {
  return defineComponent({
    name: 'LhxConfiguredPage',
    setup() {
      const state = ref<Record<string, unknown>>({...(options.state ?? {})});
      const resolvedSchema = shallowRef<PageSchema | null>(null);
      const resolvedComponents = shallowRef<Map<string, Component | string>>(new Map());
      const loaded = ref(false);

      const ctx = computed<EvalContext>(() => ({
        state: state.value,
        flags: options.flags,
        env: options.env,
        data: options.data
      }));

      function diag(d: RendererDiagnostic) {
        options.onDiagnostic?.(d);
      }

      async function loadAll(): Promise<void> {
        // 1. pick base
        let base: PageSchema | null = null;
        let patches: SchemaPatch[] = [];
        if (options.variants?.length) {
          const picked = resolveVariant(options.variants, ctx.value, diag);
          if (picked) {
            base = picked.base;
            patches = [...picked.patches];
          }
        }
        if (!base) base = options.schema ?? null;
        if (!base) {
          diag({level: 'error', code: 'renderer/no-base-schema', message: 'No schema or matching variant.'});
          return;
        }

        // Validate base (so we surface problems even when remote isn't used).
        // Opt-in via `options.validate` — see the note on `ReactRendererOptions.validate`.
        if (options.validate) {
          const {pageSchema} = await import('./schema-zod');
          const baseCheck = pageSchema.safeParse(base);
          if (!baseCheck.success) {
            diag({
              level: 'error',
              code: 'renderer/invalid-base-schema',
              message: `Base schema validation failed: ${baseCheck.error.issues.length} issue(s).`
            });
            return;
          }
        }

        // 2. remote merge
        let merged = mergeSchema(base, patches, diag);
        if (options.remote?.url) {
          const remote = await fetchRemoteSchema({
            ...options.remote,
            fallback: merged,
            onDiagnostic: diag
          });
          if (remote !== merged) merged = mergeSchema(remote, [], diag);
        }

        // 3. caller-level patches
        if (options.patches?.length) {
          merged = mergeSchema(merged, options.patches, diag);
        }

        resolvedSchema.value = merged;
        resolvedComponents.value = await options.registry.resolve(merged, diag);
        loaded.value = true;
      }

      onMounted(() => {
        loadAll().catch(error => {
          diag({
            level: 'error',
            code: 'renderer/setup-failed',
            message: error instanceof Error ? error.message : String(error)
          });
        });
      });

      function resolveComponent(name: string): Component | string {
        const hit = resolvedComponents.value.get(name);
        if (hit) {
          if (typeof hit === 'function' || (typeof hit === 'object' && hit !== null)) {
            // If the caller registered a plain object component, wrap async loaders transparently.
            return typeof (hit as {render?: unknown}).render === 'function' || typeof hit === 'string'
              ? (hit as Component | string)
              : defineAsyncComponent(async () => hit as Component);
          }
          return hit;
        }
        return options.fallbackTag ?? 'div';
      }

      function renderNode(node: RenderNode): VNode {
        const component = resolveComponent(node.name);
        const props: Record<string, unknown> = {
          ...node.props,
          key: node.key
        };
        for (const [eventName, expr] of Object.entries(node.events)) {
          props[`on${capitalize(eventName)}`] = () =>
            dispatchAction(expr as ActionExpr, options.actions ?? {}, ctx.value);
        }

        const childrenVNodes = node.children.map(renderNode);
        const slotEntries = Object.entries(node.slots);
        if (slotEntries.length === 0) {
          return h(component as Component | string, props, {default: () => childrenVNodes});
        }

        const slots: Record<string, () => VNode[]> = {
          default: () => childrenVNodes
        };
        for (const [slotName, slotNodes] of slotEntries) {
          slots[slotName] = () => slotNodes.map(renderNode);
        }
        return h(component as Component | string, props, slots);
      }

      return () => {
        if (!loaded.value || !resolvedSchema.value) {
          return h('div', {class: 'lhx-configured-page--loading'});
        }
        const nodes = walkComponents(resolvedSchema.value.components, ctx.value);
        return h('div', {class: 'lhx-configured-page'}, nodes.map(renderNode));
      };
    }
  }) as unknown as DefineComponent;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
