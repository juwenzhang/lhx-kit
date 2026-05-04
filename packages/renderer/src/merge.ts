import type {ComponentSchema, PageSchema, RendererDiagnostic, SchemaPatch, SchemaPatchTarget} from './schema';

type Diag = (d: RendererDiagnostic) => void;

/**
 * Deeply clone a component subtree. We keep this explicit rather than relying
 * on structuredClone so the code runs in older targets and we don't accidentally
 * serialize non-plain members.
 */
function cloneNode(node: ComponentSchema): ComponentSchema {
  return JSON.parse(JSON.stringify(node)) as ComponentSchema;
}

function findNode(
  nodes: ComponentSchema[],
  target: SchemaPatchTarget
): {parent: ComponentSchema[]; index: number} | null {
  if ('path' in target) {
    const path = [...target.path];
    if (path.length === 0) return null;
    let current: ComponentSchema[] = nodes;
    for (let i = 0; i < path.length - 1; i++) {
      const idx = path[i];
      const node = current[idx];
      if (!node) return null;
      current = node.children ?? [];
    }
    const last = path[path.length - 1];
    if (current[last] === undefined) return null;
    return {parent: current, index: last};
  }

  const match: (n: ComponentSchema) => boolean = 'id' in target ? n => n.id === target.id : n => n.name === target.name;

  // BFS across children and slots.
  const queue: Array<{parent: ComponentSchema[]; index: number}> = [];
  for (let i = 0; i < nodes.length; i++) queue.push({parent: nodes, index: i});
  while (queue.length > 0) {
    const head = queue.shift();
    if (!head) break;
    const {parent, index} = head;
    const node = parent[index];
    if (!node) continue;
    if (match(node)) return {parent, index};
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) queue.push({parent: node.children, index: i});
    }
    if (node.slots) {
      for (const slotChildren of Object.values(node.slots)) {
        for (let i = 0; i < slotChildren.length; i++) queue.push({parent: slotChildren, index: i});
      }
    }
  }
  return null;
}

function asComponentSchema(value: unknown, diag?: Diag, op?: string): ComponentSchema | null {
  if (!value || typeof value !== 'object') {
    diag?.({
      level: 'error',
      code: 'renderer/merge-invalid-value',
      message: `${op ?? 'patch'} requires a component schema in \`value\`.`
    });
    return null;
  }
  const v = value as Partial<ComponentSchema>;
  if (typeof v.name !== 'string' || v.name.length === 0) {
    diag?.({
      level: 'error',
      code: 'renderer/merge-invalid-value',
      message: `${op ?? 'patch'} value is missing \`name\`.`
    });
    return null;
  }
  return v as ComponentSchema;
}

function applyOne(base: PageSchema, patch: SchemaPatch, diag?: Diag): PageSchema {
  const components = base.components.map(cloneNode);
  const hit = findNode(components, patch.target);

  if (!hit) {
    diag?.({
      level: 'warn',
      code: 'renderer/merge-target-missing',
      message: `Patch target not found: ${JSON.stringify(patch.target)}`
    });
    return {...base, components};
  }

  const {parent, index} = hit;
  const node = parent[index];

  switch (patch.op) {
    case 'replace': {
      const next = asComponentSchema(patch.value, diag, 'replace');
      if (!next) return {...base, components};
      parent[index] = cloneNode(next);
      break;
    }
    case 'remove': {
      parent.splice(index, 1);
      break;
    }
    case 'patchProps': {
      if (!patch.value || typeof patch.value !== 'object') {
        diag?.({
          level: 'error',
          code: 'renderer/merge-invalid-value',
          message: 'patchProps requires a plain object `value`.'
        });
        return {...base, components};
      }
      node.props = {...(node.props ?? {}), ...(patch.value as Record<string, unknown>)};
      break;
    }
    case 'append':
    case 'prepend': {
      const child = asComponentSchema(patch.value, diag, patch.op);
      if (!child) return {...base, components};
      if (patch.slot) {
        node.slots = {...(node.slots ?? {})};
        const existing = node.slots[patch.slot] ? [...node.slots[patch.slot]] : [];
        const cloned = cloneNode(child);
        if (patch.op === 'append') existing.push(cloned);
        else existing.unshift(cloned);
        node.slots[patch.slot] = existing;
      } else {
        const children = node.children ? [...node.children] : [];
        const cloned = cloneNode(child);
        if (patch.op === 'append') children.push(cloned);
        else children.unshift(cloned);
        node.children = children;
      }
      break;
    }
  }

  return {...base, components};
}

/**
 * Apply a list of patches in order to a base schema, producing a new schema.
 * Does not mutate the input. Unknown targets produce diagnostics rather than
 * throwing, so remote payloads that drift out of sync degrade gracefully.
 */
export function mergeSchema(base: PageSchema, patches: SchemaPatch[] | undefined, onDiagnostic?: Diag): PageSchema {
  if (!patches || patches.length === 0) return base;
  let current = base;
  for (const patch of patches) {
    current = applyOne(current, patch, onDiagnostic);
  }
  return current;
}
