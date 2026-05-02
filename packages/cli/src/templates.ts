import {existsSync} from 'node:fs';
import {join} from 'node:path';
import fse from 'fs-extra';
import {downloadTemplate} from 'giget';

export interface TemplateManifest {
  name: string;
  title: string;
  description: string;
  framework: 'vue3' | 'react';
  projectType: 'spa' | 'h5' | 'admin';
  tags?: string[];
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
}

/**
 * Minimal token engine: replaces `<%= name %>` with variables[name].
 * Also supports `<%= appTitle %>`, `<%= projectName %>`, etc.
 * Chosen over handlebars to avoid conflicts with JSX `{{...}}`.
 */
function renderString(input: string, variables: TemplateVariables): string {
  return input.replace(/<%=\s*([a-zA-Z0-9_]+)\s*%>/g, (_, key: string) => {
    const value = (variables as unknown as Record<string, unknown>)[key];
    return value === undefined ? '' : String(value);
  });
}

function renderPath(input: string, variables: TemplateVariables): string {
  const rendered = renderString(input, variables);
  return rendered.endsWith('.template') ? rendered.slice(0, -'.template'.length) : rendered;
}

export async function listBuiltinTemplates(templatesDir: string): Promise<TemplateManifest[]> {
  if (!existsSync(templatesDir)) return [];
  const entries = await fse.readdir(templatesDir, {withFileTypes: true});
  const manifests: TemplateManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
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
  variables: TemplateVariables
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
  variables: TemplateVariables;
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
