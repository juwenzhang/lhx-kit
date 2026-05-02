import {
  type ComponentType,
  type JSX,
  type ReactElement,
  type ReactNode,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type {EvalContext} from './expression';
import {mergeSchema} from './merge';
import type {Registry} from './registry';
import {type RemoteFetchOptions, fetchRemoteSchema} from './remote';
import type {ActionExpr, PageSchema, RendererDiagnostic, SchemaPatch, VariantList} from './schema';
import {resolveVariant} from './variant';
import {type RenderNode, dispatchAction, walkComponents} from './walker';

export type ReactRenderable = ComponentType<Record<string, unknown>> | string;

export interface ReactRendererOptions {
  schema?: PageSchema;
  variants?: VariantList;
  registry: Registry<ReactRenderable>;
  patches?: SchemaPatch[];
  remote?: Omit<RemoteFetchOptions, 'fallback' | 'onDiagnostic'>;
  state?: Record<string, unknown>;
  flags?: Record<string, unknown>;
  env?: Record<string, unknown>;
  data?: Record<string, unknown>;
  actions?: Record<string, (payload: Record<string, unknown>, ctx: EvalContext) => void>;
  fallbackTag?: keyof JSX.IntrinsicElements;
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
 * Create a React component that renders a page from a config-driven schema.
 */
export function createConfiguredPage(options: ReactRendererOptions) {
  function LhxConfiguredPage(): ReactElement {
    const [schemaState, setSchemaState] = useState<PageSchema | null>(null);
    const [components, setComponents] = useState<Map<string, ReactRenderable>>(new Map());
    const [state] = useState<Record<string, unknown>>({...(options.state ?? {})});
    const loadedRef = useRef(false);

    const ctx = useMemo<EvalContext>(
      () => ({state, flags: options.flags, env: options.env, data: options.data}),
      [state]
    );

    useEffect(() => {
      if (loadedRef.current) return;
      loadedRef.current = true;
      loadAll().catch(error => {
        options.onDiagnostic?.({
          level: 'error',
          code: 'renderer/setup-failed',
          message: error instanceof Error ? error.message : String(error)
        });
      });

      async function loadAll() {
        let base: PageSchema | null = null;
        let patches: SchemaPatch[] = [];
        if (options.variants?.length) {
          const picked = resolveVariant(options.variants, ctx, options.onDiagnostic);
          if (picked) {
            base = picked.base;
            patches = [...picked.patches];
          }
        }
        if (!base) base = options.schema ?? null;
        if (!base) {
          options.onDiagnostic?.({
            level: 'error',
            code: 'renderer/no-base-schema',
            message: 'No schema or matching variant.'
          });
          return;
        }

        // Defensive zod parse is opt-in. Keeping `pageSchema` behind a
        // dynamic `import()` means zod only enters the client bundle when
        // the consumer explicitly requests validation — static JSON
        // imports are already TS-checked against `PageSchema` at build
        // time, so the runtime check is pure overhead for them.
        if (options.validate) {
          const {pageSchema} = await import('./schema-zod');
          const check = pageSchema.safeParse(base);
          if (!check.success) {
            options.onDiagnostic?.({
              level: 'error',
              code: 'renderer/invalid-base-schema',
              message: `Base schema validation failed: ${check.error.issues.length} issue(s).`
            });
            return;
          }
        }

        let merged = mergeSchema(base, patches, options.onDiagnostic);
        if (options.remote?.url) {
          const remote = await fetchRemoteSchema({
            ...options.remote,
            fallback: merged,
            onDiagnostic: options.onDiagnostic
          });
          if (remote !== merged) merged = mergeSchema(remote, [], options.onDiagnostic);
        }
        if (options.patches?.length) {
          merged = mergeSchema(merged, options.patches, options.onDiagnostic);
        }

        const resolved = await options.registry.resolve(merged, options.onDiagnostic);
        setSchemaState(merged);
        setComponents(resolved);
      }
    }, [ctx]);

    if (!schemaState) {
      return createElement('div', {className: 'lhx-configured-page--loading'});
    }

    const nodes = walkComponents(schemaState.components, ctx);
    const children = nodes.map(n => renderNode(n, components, options, ctx));
    return createElement('div', {className: 'lhx-configured-page'}, ...children);
  }

  return LhxConfiguredPage;
}

function renderNode(
  node: RenderNode,
  components: Map<string, ReactRenderable>,
  options: ReactRendererOptions,
  ctx: EvalContext
): ReactElement {
  const Component = components.get(node.name) ?? options.fallbackTag ?? 'div';
  const props: Record<string, unknown> = {
    ...node.props,
    key: node.key
  };
  for (const [eventName, expr] of Object.entries(node.events)) {
    props[`on${capitalize(eventName)}`] = () => dispatchAction(expr as ActionExpr, options.actions ?? {}, ctx);
  }

  const defaultChildren: ReactNode[] = node.children.map(n => renderNode(n, components, options, ctx));
  const slotEntries = Object.entries(node.slots);
  if (slotEntries.length === 0) {
    return createElement(Component as ComponentType<Record<string, unknown>>, props, ...defaultChildren);
  }

  // React does not have named slots; expose them as props like `slotName: ReactNode[]`.
  const slotProps: Record<string, ReactNode[]> = {};
  for (const [slotName, slotNodes] of slotEntries) {
    slotProps[slotName] = slotNodes.map(n => renderNode(n, components, options, ctx));
  }
  return createElement(
    Component as ComponentType<Record<string, unknown>>,
    {...props, ...slotProps},
    ...defaultChildren
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
