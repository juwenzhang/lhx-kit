import {existsSync} from 'node:fs';
import {basename, join} from 'node:path';
import fse from 'fs-extra';
import {downloadTemplate} from 'giget';
import {FeatureManifestSchema, type FeatureManifestZ, type PatchOp} from '../core/schema';

export interface TemplateManifest {
  name: string;
  title: string;
  description: string;
  framework?: 'vue3' | 'react';
  category?: 'frontend' | 'backend' | 'library' | 'business';
  projectType?: 'spa' | 'h5' | 'admin' | 'service' | 'lib' | 'monorepo';
  /**
   * If set to `"_shared"`, the template inherits the cross-cutting baseline
   * files from `templates/_shared/files/` before its own `files/` are copied.
   */
  extends?: '_shared';
  /** Feature names enabled by default when the user runs `-y` and supplies no `--features`. */
  defaultFeatures?: string[];
  tags?: string[];
  /**
   * Extra npm-scope prefixes (e.g. `@my-org/`) to treat as "internal" alongside
   * the built-in `@lhx-kit/`, `@lhx-cli/`, `@lhx-business/` defaults. Internal
   * scopes get dynamic `npm view` version resolution and are eligible for the
   * `--link-workspace` rewrite. See `version-resolver.ts`.
   */
  internalPackagePrefixes?: string[];
  features?: TemplateFeatureManifest[];
  postCreate?: string[];
}

export interface TemplateFeatureManifest {
  name: string;
  title: string;
  description: string;
  patchDir?: string;
  defaultEnabled?: boolean;
}

export interface TemplateSource {
  type: 'builtin' | 'local' | 'remote';
  name: string;
  directory: string;
  manifest: TemplateManifest;
}

export interface TemplateVariables {
  projectName: string;
  packageName: string;
  appTitle: string;
  features: string[];
  year: number;
  /**
   * Semver range to pin `@lhx-kit/*` dependencies to in the generated
   * project. Typically the caret-range of the CLI itself
   * (`^<major>.<minor>.0`) so that:
   *   - bug-fix patches flow in automatically (`0.3.5 → 0.3.7`)
   *   - minor bumps (`0.3 → 0.4`) require a deliberate upgrade
   *
   * Rewritten to `workspace:*` when `--link-workspace` is set (in-monorepo
   * scaffolding); otherwise this is the value that lands in the generated
   * `package.json`.
   */
  lhxKitVersionRange: string;
  /**
   * Library scaffold variables (only meaningful when the template is a
   * library — `lib-single` / `lib-monorepo`). Empty / sensible defaults
   * for non-library templates so token substitution stays no-op.
   */
  /** Selected bundler name: `tsup` | `rslib` | `rollup` (or `''` for non-lib). */
  libBundlerName: string;
  /** Comma-separated formats list, e.g. `esm,cjs`. */
  libFormats: string;
  /** Human-readable list, e.g. `esm + cjs + umd`. */
  libFormatsHumanList: string;
  /** JS array literal of formats for tsup, e.g. `['esm', 'cjs']`. */
  libFormatsTsupLiteral: string;
  /** JS array literal for rollup outputs, embedded as the `output` array. */
  libFormatsRollupOutputsLiteral: string;
  /** JS array literal for rslib `lib` field. */
  libFormatsRslibLiteral: string;
  /** UMD global name derived from `packageName` (PascalCase). */
  libUmdGlobalName: string;
  /**
   * Index signature so this type is assignable to `Record<string, unknown>`
   * without a cast, which is what `renderString` / `copyTemplateDir` /
   * `applyFeature` accept (the `add` command also feeds those helpers a
   * plain record of per-invocation vars).
   */
  [key: string]: unknown;
}

/**
 * Minimal token engine: replaces `<%= name %>` with variables[name].
 * Also supports `<%= appTitle %>`, `<%= projectName %>`, etc.
 * Chosen over handlebars to avoid conflicts with JSX `{{...}}`.
 *
 * Accepts any record shape so the same engine drives both `create`-time
 * project variables (`TemplateVariables`) and `add`-time per-invocation
 * variables (page name, component name, …).
 */
function renderString(input: string, variables: Record<string, unknown>): string {
  return input.replace(/<%=\s*([a-zA-Z0-9_]+)\s*%>/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? '' : String(value);
  });
}

function renderPath(input: string, variables: Record<string, unknown>): string {
  const rendered = renderString(input, variables);
  return rendered.endsWith('.template') ? rendered.slice(0, -'.template'.length) : rendered;
}

export async function listBuiltinTemplates(templatesDir: string): Promise<TemplateManifest[]> {
  if (!existsSync(templatesDir)) return [];
  const entries = await fse.readdir(templatesDir, {withFileTypes: true});
  const manifests: TemplateManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Skip infrastructure dirs: `_shared/` (the cross-template baseline),
    // `_features/` (cross-template feature catalog), and `_add/` (stubs for
    // the `lhx-cli add` command) are not selectable top-level templates.
    if (entry.name.startsWith('_')) continue;
    const manifestPath = join(templatesDir, entry.name, 'template.json');
    if (!existsSync(manifestPath)) continue;
    manifests.push((await fse.readJson(manifestPath)) as TemplateManifest);
  }
  return manifests.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readTemplateSource(templatesDir: string, nameOrSource: string): Promise<TemplateSource> {
  if (/^(gh|github|gitlab|bitbucket):/.test(nameOrSource)) {
    return fetchRemote(nameOrSource);
  }
  if (nameOrSource.includes('/') || nameOrSource.startsWith('.') || existsSync(nameOrSource)) {
    return readLocal(nameOrSource);
  }
  const directory = join(templatesDir, nameOrSource);
  const manifestPath = join(directory, 'template.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Built-in template not found: ${nameOrSource}`);
  }
  return {
    type: 'builtin',
    name: nameOrSource,
    directory,
    manifest: await fse.readJson(manifestPath)
  };
}

async function readLocal(path: string): Promise<TemplateSource> {
  const manifestPath = join(path, 'template.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Local template missing template.json: ${path}`);
  }
  return {
    type: 'local',
    name: path,
    directory: path,
    manifest: await fse.readJson(manifestPath)
  };
}

async function fetchRemote(source: string): Promise<TemplateSource> {
  const {dir} = await downloadTemplate(source, {force: true});
  return readLocal(dir);
}

async function walkFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  if (!existsSync(root)) return result;
  const entries = await fse.readdir(root, {withFileTypes: true});
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await walkFiles(full)));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

function mergePackageJson(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {...target};
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      merged[key] = {...(target[key] as Record<string, unknown>), ...(value as Record<string, unknown>)};
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Files that are copied byte-for-byte without `<%= var %>` substitution.
 * Binary assets (images/fonts) and well-known vendor payloads (MSW worker)
 * belong here; they must never be touched by the tiny token engine.
 */
const BINARY_OR_VERBATIM_PATTERNS: RegExp[] = [
  /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?)$/i,
  /\.(woff2?|ttf|otf|eot)$/i,
  /\.(pdf|zip|gz|bz2|7z|tar|rar)$/i,
  /(^|\/)mockServiceWorker\.js$/
];

function shouldCopyVerbatim(relPath: string): boolean {
  return BINARY_OR_VERBATIM_PATTERNS.some(re => re.test(relPath));
}

async function applyFile(
  sourceFile: string,
  relPath: string,
  targetDir: string,
  variables: Record<string, unknown>
): Promise<string> {
  const targetPath = join(targetDir, renderPath(relPath, variables));
  await fse.ensureDir(join(targetPath, '..'));

  if (shouldCopyVerbatim(relPath)) {
    await fse.copy(sourceFile, targetPath);
    return targetPath;
  }

  const content = await fse.readFile(sourceFile, 'utf8');
  const rendered = renderString(content, variables);

  if (targetPath.endsWith('package.json') && existsSync(targetPath)) {
    const existing = await fse.readJson(targetPath);
    const patch = JSON.parse(rendered);
    await fse.writeJson(targetPath, mergePackageJson(existing, patch), {spaces: 2});
    return targetPath;
  }

  // .gitignore: always append on conflict (shared base + template appendage +
  // optional feature appendages). Avoids overwriting accumulated rules from
  // earlier layers and de-dupes line-by-line so re-applying is idempotent.
  if (basename(targetPath) === '.gitignore' && existsSync(targetPath)) {
    const previous = await fse.readFile(targetPath, 'utf8');
    const existingLines = new Set(previous.split('\n').map(l => l.trimEnd()));
    const appended = rendered
      .split('\n')
      .filter(line => !existingLines.has(line.trimEnd()))
      .join('\n');
    if (appended.trim().length > 0) {
      const sep = previous.endsWith('\n') ? '' : '\n';
      await fse.writeFile(targetPath, `${previous}${sep}${appended}${appended.endsWith('\n') ? '' : '\n'}`);
    }
    return targetPath;
  }

  if (targetPath.endsWith('.env') || /\.env\.[^/]+$/.test(targetPath)) {
    if (existsSync(targetPath)) {
      const previous = await fse.readFile(targetPath, 'utf8');
      if (!previous.includes(rendered.trim())) {
        await fse.writeFile(targetPath, `${previous}\n${rendered}`);
      }
      return targetPath;
    }
  }

  await fse.writeFile(targetPath, rendered);
  return targetPath;
}

export interface CopyDirOptions {
  sourceDir: string;
  targetDir: string;
  variables: Record<string, unknown>;
}

export async function copyTemplateDir(options: CopyDirOptions): Promise<string[]> {
  const files = await walkFiles(options.sourceDir);
  const written: string[] = [];
  for (const file of files) {
    const rel = file.slice(options.sourceDir.length + 1);
    written.push(await applyFile(file, rel, options.targetDir, options.variables));
  }
  return written;
}

export {renderString};

/**
 * `_shared/` baseline directory under the templates root, copied before any
 * template-specific files when a template declares `extends: "_shared"`.
 * Returns `null` when the layer is absent (e.g. running against an old
 * template tarball that predates the shared layer).
 */
export function resolveSharedDir(templatesDir: string): string | null {
  const candidate = join(templatesDir, '_shared', 'files');
  return existsSync(candidate) ? candidate : null;
}

export interface CopyStubsOptions {
  sourceDir: string;
  targetDir: string;
  variables: Record<string, unknown>;
}

export interface CopyStubsEntry {
  /** Destination path relative to `targetDir` (with `<%= … %>` substituted). */
  rel: string;
  /** `false` when the file already existed and was left untouched. */
  created: boolean;
}

/**
 * Copy a stub tree under `templates/_add/...` into `targetDir`, substituting
 * `<%= var %>` in both file paths and file contents. Files already present at
 * the destination are skipped — re-running an `lhx-cli add` command never
 * clobbers user edits.
 *
 * Differs from `copyTemplateDir`:
 * - Skip-if-exists semantics (no append/merge for `.gitignore` / `.env` /
 *   `package.json`). Stubs are per-invocation and idempotency comes from
 *   skip-if-exists rather than the merge magic that `create` needs.
 * - No special-case rendering paths — every file reads as UTF-8 and writes
 *   the rendered body. Don't put binary assets under `_add/`.
 */
export async function copyStubs(options: CopyStubsOptions): Promise<CopyStubsEntry[]> {
  if (!existsSync(options.sourceDir)) {
    throw new Error(`stub directory missing: ${options.sourceDir}`);
  }
  const result: CopyStubsEntry[] = [];
  const files = await walkFiles(options.sourceDir);
  for (const file of files) {
    const srcRel = file.slice(options.sourceDir.length + 1);
    const dstRel = renderPath(srcRel, options.variables);
    const dstAbs = join(options.targetDir, dstRel);
    if (existsSync(dstAbs)) {
      result.push({rel: dstRel, created: false});
      continue;
    }
    await fse.ensureDir(join(dstAbs, '..'));
    const raw = await fse.readFile(file, 'utf8');
    const body = renderString(raw, options.variables);
    await fse.writeFile(dstAbs, body);
    result.push({rel: dstRel, created: true});
  }
  return result;
}

/**
 * Read a single stub file from disk and return its rendered body. Caller
 * decides the destination path — used by `lhx-cli add` for kinds whose
 * destination depends on runtime checks (e.g. `add schema` writes under
 * `pages/<name>/render.json` or `schemas/<name>.json` depending on whether
 * the page dir already exists).
 */
export async function renderStubFile(stubFile: string, variables: Record<string, unknown>): Promise<string> {
  const raw = await fse.readFile(stubFile, 'utf8');
  return renderString(raw, variables);
}

export interface ScaffoldFeature {
  name: string;
  /** Absolute directory containing files/, feature.json, patches.json (when present). */
  directory: string;
  /** Parsed feature.json (zod-validated). */
  manifest: FeatureManifestZ;
}

/**
 * Load and validate a feature manifest from `<dir>/feature.json`.
 * Returns `null` for legacy directories that have no manifest yet (e.g. the
 * original `offline` feature that pre-dates the schema). Callers fall back to
 * the legacy "copy patchDir verbatim" behavior in that case.
 */
export async function loadFeatureManifest(directory: string): Promise<FeatureManifestZ | null> {
  const manifestPath = join(directory, 'feature.json');
  if (!existsSync(manifestPath)) return null;
  const raw = await fse.readJson(manifestPath);
  return FeatureManifestSchema.parse(raw);
}

/**
 * Discover features for a top-level template by scanning `<template>/features/*`
 * and `_features/` (cross-template features keyed via `appliesTo`). Returns the
 * subset whose names appear in `selected` and whose manifest applies to the
 * current template, sorted by priority ascending (lower priority applies first).
 */
export async function loadFeaturesForTemplate(
  templatesDir: string,
  templateDir: string,
  templateName: string,
  selected: string[]
): Promise<ScaffoldFeature[]> {
  const found: ScaffoldFeature[] = [];

  const scanDir = async (root: string) => {
    if (!existsSync(root)) return;
    const entries = await fse.readdir(root, {withFileTypes: true});
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(root, entry.name);
      const manifest = await loadFeatureManifest(dir);
      if (!manifest) continue;
      if (!selected.includes(manifest.name)) continue;
      if (manifest.appliesTo.length > 0 && !manifest.appliesTo.includes(templateName)) continue;
      found.push({name: manifest.name, directory: dir, manifest});
    }
  };

  await scanDir(join(templateDir, 'features'));
  await scanDir(join(templatesDir, '_features'));

  return found.sort((a, b) => a.manifest.priority - b.manifest.priority);
}

/**
 * Apply a patch op to an already-scaffolded file in `targetDir`. Hard-fails
 * when the anchor required by the op is missing (per design.md §3.3) — that
 * indicates the template author removed the anchor and a feature now points
 * at a void.
 */
export async function applyPatchOp(targetDir: string, op: PatchOp, variables: Record<string, unknown>): Promise<void> {
  const filePath = join(targetDir, op.file);
  if (!existsSync(filePath)) {
    throw new Error(`patch target missing: ${op.file} (op=${op.op})`);
  }
  const original = await fse.readFile(filePath, 'utf8');

  if (op.op === 'append') {
    const rendered = renderString(op.content, variables);
    const sep = original.endsWith('\n') ? '' : '\n';
    await fse.writeFile(filePath, `${original}${sep}${rendered}${rendered.endsWith('\n') ? '' : '\n'}`);
    return;
  }
  if (op.op === 'prepend') {
    const rendered = renderString(op.content, variables);
    await fse.writeFile(filePath, `${rendered}${rendered.endsWith('\n') ? '' : '\n'}${original}`);
    return;
  }
  if (op.op === 'merge-imports') {
    const renderedImports = op.imports.map(line => renderString(line, variables));
    const missing = renderedImports.filter(line => !original.includes(line.trim()));
    if (missing.length === 0) return;
    // Insert after the last existing import line, or at top if none exist.
    const lines = original.split('\n');
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*import\b/.test(lines[i] ?? '')) lastImport = i;
    }
    const insertion = missing.join('\n');
    if (lastImport >= 0) {
      lines.splice(lastImport + 1, 0, insertion);
    } else {
      lines.unshift(insertion);
    }
    await fse.writeFile(filePath, lines.join('\n'));
    return;
  }

  // anchor-based ops
  if (!original.includes(op.anchor)) {
    throw new Error(`anchor missing: ${op.anchor} not found in ${op.file} (op=${op.op})`);
  }
  const rendered = renderString(op.content, variables);
  let next: string;
  if (op.op === 'insert-after') {
    next = original.replace(op.anchor, `${op.anchor}\n${rendered}`);
  } else if (op.op === 'insert-before') {
    next = original.replace(op.anchor, `${rendered}\n${op.anchor}`);
  } else {
    // replace
    next = original.replace(op.anchor, rendered);
  }
  await fse.writeFile(filePath, next);
}

export interface ApplyFeatureOptions {
  feature: ScaffoldFeature;
  targetDir: string;
  variables: Record<string, unknown>;
  /**
   * Top-level template name (e.g. `lib-monorepo`). Required so features can
   * decide whether to fan out their files+overlay across `packages/*` (see
   * `FeatureManifest.monorepoExpand`).
   */
  templateName: string;
}

/**
 * Resolve a single-segment glob like `packages/*` against `targetDir`,
 * returning the relative subdirectory paths (`packages/core`, `packages/utils`,
 * …). Restricted to one trailing `/*` for predictability; the schema's
 * `monorepoExpand` documents this constraint.
 */
async function expandSimpleGlob(targetDir: string, pattern: string): Promise<string[]> {
  const trail = '/*';
  if (!pattern.endsWith(trail)) {
    // Treat as literal directory.
    return existsSync(join(targetDir, pattern)) ? [pattern] : [];
  }
  const prefix = pattern.slice(0, -trail.length);
  const root = join(targetDir, prefix);
  if (!existsSync(root)) return [];
  const entries = await fse.readdir(root, {withFileTypes: true});
  return entries.filter(e => e.isDirectory()).map(e => `${prefix}/${e.name}`);
}

/**
 * Apply a manifest-validated feature: copy files/, run patches/, overlay
 * package.json, append to .gitignore. Each step is idempotent so re-applying
 * the same feature produces the same result.
 *
 * `monorepoExpand` short-circuits for the matching template: the feature's
 * files + packageOverlay are replicated across each subdirectory that matches
 * the paired glob, while `patches`, `gitignoreAppend`, and `requireAnchors`
 * still target the workspace root.
 */
export async function applyFeature(options: ApplyFeatureOptions): Promise<string[]> {
  const {feature, targetDir, variables, templateName} = options;

  if (feature.manifest.requireAnchors) {
    for (const ra of feature.manifest.requireAnchors) {
      const path = join(targetDir, ra.file);
      if (!existsSync(path)) {
        throw new Error(`feature ${feature.name}: required anchor file missing: ${ra.file}`);
      }
      const content = await fse.readFile(path, 'utf8');
      if (!content.includes(ra.anchor)) {
        throw new Error(`feature ${feature.name}: anchor ${ra.anchor} missing in ${ra.file}`);
      }
    }
  }

  const written: string[] = [];
  const expandPattern = feature.manifest.monorepoExpand?.[templateName];
  const expandTargets = expandPattern ? await expandSimpleGlob(targetDir, expandPattern) : null;

  const writeFilesAndOverlay = async (relPrefix: string): Promise<void> => {
    const subTargetDir = relPrefix ? join(targetDir, relPrefix) : targetDir;

    const filesDir = join(feature.directory, 'files');
    if (existsSync(filesDir)) {
      const filesWritten = await copyTemplateDir({sourceDir: filesDir, targetDir: subTargetDir, variables});
      written.push(...filesWritten);
    }

    if (feature.manifest.packageOverlay) {
      const pkgPath = join(subTargetDir, 'package.json');
      if (existsSync(pkgPath)) {
        const existing = (await fse.readJson(pkgPath)) as Record<string, unknown>;
        const overlay = JSON.parse(renderString(JSON.stringify(feature.manifest.packageOverlay), variables)) as Record<
          string,
          unknown
        >;
        await fse.writeJson(pkgPath, mergePackageJson(existing, overlay), {spaces: 2});
      }
    }
  };

  if (expandTargets && expandTargets.length > 0) {
    for (const target of expandTargets) {
      await writeFilesAndOverlay(target);
    }
  } else {
    await writeFilesAndOverlay('');
  }

  // `workspaceOverlay` always targets the workspace root regardless of
  // `monorepoExpand`. For single-pkg templates root === package dir so
  // this is a no-op if packageOverlay already wrote the same keys there.
  if (feature.manifest.workspaceOverlay) {
    const pkgPath = join(targetDir, 'package.json');
    if (existsSync(pkgPath)) {
      const existing = (await fse.readJson(pkgPath)) as Record<string, unknown>;
      const overlay = JSON.parse(renderString(JSON.stringify(feature.manifest.workspaceOverlay), variables)) as Record<
        string,
        unknown
      >;
      await fse.writeJson(pkgPath, mergePackageJson(existing, overlay), {spaces: 2});
    }
  }

  if (feature.manifest.patches?.length) {
    for (const op of feature.manifest.patches) {
      await applyPatchOp(targetDir, op, variables);
    }
  }

  if (feature.manifest.gitignoreAppend?.length) {
    const giPath = join(targetDir, '.gitignore');
    const previous = existsSync(giPath) ? await fse.readFile(giPath, 'utf8') : '';
    const existingLines = new Set(previous.split('\n').map(l => l.trimEnd()));
    const lines = feature.manifest.gitignoreAppend.filter(line => !existingLines.has(line.trimEnd()));
    if (lines.length > 0) {
      const sep = previous.endsWith('\n') || previous.length === 0 ? '' : '\n';
      const block = `\n# from feature: ${feature.name}\n${lines.join('\n')}\n`;
      await fse.writeFile(giPath, `${previous}${sep}${block}`);
    }
  }

  return written;
}
