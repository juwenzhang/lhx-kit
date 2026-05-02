import type {ComponentSchema, PageSchema, RendererDiagnostic} from './schema';

/**
 * A component loader is any factory returning the framework-specific component.
 * Synchronous loaders are wrapped as resolved promises internally.
 */
export type ComponentLoader<TComponent = unknown> = () => TComponent | Promise<TComponent>;

export interface RegistryEntry<TComponent = unknown> {
  loader: ComponentLoader<TComponent>;
  /** Optional display category / description; helpful for tooling. */
  category?: string;
  description?: string;
}

export interface Registry<TComponent = unknown> {
  register(name: string, loader: ComponentLoader<TComponent>, meta?: {category?: string; description?: string}): void;
  registerAll(map: Record<string, ComponentLoader<TComponent> | RegistryEntry<TComponent>>): void;
  has(name: string): boolean;
  getLoader(name: string): ComponentLoader<TComponent> | undefined;
  /** Walk the schema and return the unique set of component names referenced. */
  referencedNames(schema: PageSchema): Set<string>;
  /**
   * Resolve all referenced components in advance. Returns a map of name → resolved
   * component. Missing names are reported via `onDiagnostic`.
   */
  resolve(schema: PageSchema, onDiagnostic?: (d: RendererDiagnostic) => void): Promise<Map<string, TComponent>>;
}

export function createRegistry<TComponent = unknown>(): Registry<TComponent> {
  const entries = new Map<string, RegistryEntry<TComponent>>();

  function register(
    name: string,
    loader: ComponentLoader<TComponent>,
    meta?: {category?: string; description?: string}
  ): void {
    entries.set(name, {loader, ...meta});
  }

  function registerAll(map: Record<string, ComponentLoader<TComponent> | RegistryEntry<TComponent>>): void {
    for (const [name, value] of Object.entries(map)) {
      if (typeof value === 'function') {
        register(name, value as ComponentLoader<TComponent>);
      } else {
        entries.set(name, value);
      }
    }
  }

  function collectNames(nodes: ComponentSchema[] | undefined, into: Set<string>): void {
    if (!nodes) return;
    for (const node of nodes) {
      into.add(node.name);
      collectNames(node.children, into);
      if (node.slots) {
        for (const slotChildren of Object.values(node.slots)) {
          collectNames(slotChildren, into);
        }
      }
    }
  }

  function referencedNames(schema: PageSchema): Set<string> {
    const set = new Set<string>();
    collectNames(schema.components, set);
    return set;
  }

  async function resolve(
    schema: PageSchema,
    onDiagnostic?: (d: RendererDiagnostic) => void
  ): Promise<Map<string, TComponent>> {
    const names = referencedNames(schema);
    const out = new Map<string, TComponent>();
    await Promise.all(
      [...names].map(async name => {
        const entry = entries.get(name);
        if (!entry) {
          onDiagnostic?.({
            level: 'warn',
            code: 'renderer/missing-component',
            message: `Component "${name}" is not registered.`,
            path: ['components', name]
          });
          return;
        }
        try {
          const result = await entry.loader();
          out.set(name, result);
        } catch (error) {
          onDiagnostic?.({
            level: 'error',
            code: 'renderer/loader-error',
            message: `Loader for "${name}" threw: ${error instanceof Error ? error.message : String(error)}`,
            path: ['components', name]
          });
        }
      })
    );
    return out;
  }

  return {
    register,
    registerAll,
    has: name => entries.has(name),
    getLoader: name => entries.get(name)?.loader,
    referencedNames,
    resolve
  };
}
