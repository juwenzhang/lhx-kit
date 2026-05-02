/**
 * Public entrypoint for `@lhx-kit/renderer`.
 *
 * We deliberately re-export **types only** from `./schema` here so that
 * downstream consumers who just need the shapes don't pull zod into
 * their client bundle. Runtime validators live under
 * `@lhx-kit/renderer/schema-zod` and should be imported explicitly
 * (typically via a dynamic `import()`) when runtime parsing is needed.
 */
export * from './schema';
export * from './expression';
export * from './registry';
export * from './merge';
export * from './remote';
export * from './variant';
export * from './walker';
