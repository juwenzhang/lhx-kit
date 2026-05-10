/**
 * Identifier-shape transforms used when generating code (page / component /
 * package names → exported symbols, file names, etc.).
 *
 * Inputs are lowercase kebab-case by convention (`order-list`, `my-pkg`),
 * but the helpers tolerate other separators (underscore, whitespace) so a
 * stray `My_Pkg` still produces a sensible PascalCase.
 */

export function toPascal(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function toCamel(name: string): string {
  const pascal = toPascal(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function toTitle(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Looser variant used by `create` to derive a kebab-case package identity from
 * an arbitrary user-typed project name. Strips a leading scope (`@scope/...`),
 * collapses non-alphanumerics to `-`, and falls back to `app` on empty input
 * so the generated package always has a valid name.
 */
export function toKebab(input: string): string {
  return (
    input
      .replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
      .replace(/[^a-z0-9-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'app'
  );
}

/**
 * Variant of `toPascal` used by `create` for the UMD global name. Strips a
 * leading scope so `@my-org/foo-bar` becomes `FooBar`, not `MyOrgFooBar`.
 */
export function toPascalGlobal(input: string): string {
  const cleaned = input
    .replace(/^@[^/]+\//, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
  if (!cleaned) return 'App';
  return cleaned
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
