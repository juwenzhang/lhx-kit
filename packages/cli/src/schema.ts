import {z} from 'zod';

export const TemplateExtendsSchema = z.literal('_shared').optional();

export const TemplateManifestSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  framework: z.enum(['vue3', 'react']).optional(),
  category: z.enum(['frontend', 'backend', 'library', 'business']).optional(),
  projectType: z.enum(['spa', 'h5', 'admin', 'service', 'lib', 'monorepo']).optional(),
  extends: TemplateExtendsSchema,
  tags: z.array(z.string()).optional(),
  defaultFeatures: z.array(z.string()).optional(),
  appliesTo: z.array(z.string()).optional(),
  /**
   * Extra npm-scope prefixes (e.g. `@my-org/`) to treat as "internal" alongside
   * the built-in `@lhx-kit/`, `@lhx-cli/`, `@lhx-business/` defaults. Internal
   * scopes get dynamic `npm view` version resolution and are eligible for the
   * `--link-workspace` rewrite to `workspace:*`.
   */
  internalPackagePrefixes: z.array(z.string()).optional(),
  features: z
    .array(
      z.object({
        name: z.string(),
        title: z.string(),
        description: z.string(),
        patchDir: z.string().optional(),
        defaultEnabled: z.boolean().optional()
      })
    )
    .optional(),
  postCreate: z.array(z.string()).optional()
});

export type TemplateManifestZ = z.infer<typeof TemplateManifestSchema>;

export const PatchOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('insert-after'),
    file: z.string(),
    anchor: z.string(),
    content: z.string()
  }),
  z.object({
    op: z.literal('insert-before'),
    file: z.string(),
    anchor: z.string(),
    content: z.string()
  }),
  z.object({
    op: z.literal('replace'),
    file: z.string(),
    anchor: z.string(),
    content: z.string()
  }),
  z.object({
    op: z.literal('append'),
    file: z.string(),
    content: z.string()
  }),
  z.object({
    op: z.literal('prepend'),
    file: z.string(),
    content: z.string()
  }),
  z.object({
    op: z.literal('merge-imports'),
    file: z.string(),
    imports: z.array(z.string())
  })
]);

export type PatchOp = z.infer<typeof PatchOpSchema>;

export const PatchFileSchema = z.object({
  patches: z.array(PatchOpSchema)
});

export type PatchFileZ = z.infer<typeof PatchFileSchema>;

export const FeatureManifestSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  appliesTo: z.array(z.string()),
  mutexGroup: z.string().nullable(),
  isDefault: z.boolean().default(false),
  priority: z.number().int().default(500),
  conflictsWith: z.array(z.string()).optional(),
  requires: z.array(z.string()).optional(),
  requireAnchors: z
    .array(
      z.object({
        file: z.string(),
        anchor: z.string()
      })
    )
    .optional(),
  files: z.array(z.string()).optional(),
  patches: z.array(PatchOpSchema).optional(),
  packageOverlay: z.record(z.string(), z.unknown()).optional(),
  /**
   * Always applied to the workspace root (`targetDir`) regardless of whether
   * `monorepoExpand` is active. Use this to place devDependencies (build
   * tools, TypeScript, etc.) at the workspace root in monorepo templates,
   * while `packageOverlay` carries only per-package scripts and deps. For
   * single-package templates both `packageOverlay` and `workspaceOverlay`
   * point at the same directory so either can carry devDependencies.
   */
  workspaceOverlay: z.record(z.string(), z.unknown()).optional(),
  gitignoreAppend: z.array(z.string()).optional(),
  /**
   * Per-template fan-out: when the feature is applied to one of these
   * templates, replicate the feature's `files` + `packageOverlay` across
   * every direct subdirectory matching the paired glob (single-segment,
   * e.g. `packages/*`). Used by monorepo templates so the bundler config
   * and per-package scripts land in each member, not at the root.
   * `workspaceOverlay`, `patches`, and `gitignoreAppend` are NOT fanned
   * out — they apply once at the workspace root regardless.
   */
  monorepoExpand: z.record(z.string(), z.string()).optional()
});

export type FeatureManifestZ = z.infer<typeof FeatureManifestSchema>;
