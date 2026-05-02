import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import fse from 'fs-extra';
import prompts from 'prompts';
import {addPageToProjectConfig, addWhitelistPage} from '../ast/project-config';
import type {CliContext} from '../context';
import {type ResolvedProjectConfig, requireProject} from '../project';
import {info, muted, section, success, warn} from '../ui';

export type AddKind = 'page' | 'component' | 'api' | 'service' | 'store' | 'schema' | 'module' | 'package';

export interface AddOptions {
  /** For `add page`: override the human-readable title. */
  title?: string;
  /** For `add page`: also register the page under offline whitelist. */
  offline?: boolean;
  /** For `add package`: description written into package.json. */
  description?: string;
  /** For `add package`: force overwrite if target dir exists. */
  force?: boolean;
  /** Non-interactive mode; all required args must come from the CLI. */
  yes?: boolean;
}

const ALL_KINDS: AddKind[] = ['page', 'component', 'api', 'service', 'store', 'schema', 'module', 'package'];

const KIND_DESCRIPTIONS: Record<AddKind, string> = {
  page: 'A multi-page entry (upserts into project.config.ts)',
  component: 'A reusable UI component',
  api: 'An HTTP API wrapper',
  service: 'A domain service class',
  store: 'A state store (Pinia for vue3, Zustand for react)',
  schema: 'A renderer v1 JSON schema scaffold',
  module: 'A plain TypeScript module',
  package: 'A new publishable workspace under packages/<name> (monorepo only)'
};

/* ----------------------------- templates ----------------------------- */

/* ---- Vue page templates (scaffolded together by `add page`) --------- */

const VUE_PAGE_ENTRY = `import {createApp, defineComponent, h} from 'vue';
import {createPinia} from 'pinia';
import {RouterView} from 'vue-router';
import {create{{Name}}Router} from './router';
import {bootstrap} from '@/bootstrap';

/**
 * Shell component for the \`{{name}}\` MPA entry. Hosts <router-view/>;
 * actual content lives in ./views/*.vue.
 */
const {{Name}}Shell = defineComponent({
  name: '{{Name}}Shell',
  setup() {
    return () => h(RouterView);
  }
});

void bootstrap().then(() => {
  createApp({{Name}}Shell)
    .use(createPinia())
    .use(create{{Name}}Router())
    .mount('#app');
});
`;

const VUE_PAGE_ROUTER = `import {createRouter, createWebHashHistory, type RouteRecordRaw} from 'vue-router';

/**
 * Router scoped to the "{{name}}" MPA page. Hash history keeps this page
 * self-contained — no server-side URL rewrites required.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('./views/{{Name}}Landing.vue'),
    meta: {title: 'Landing'}
  },
  {
    path: '/about',
    component: () => import('./views/{{Name}}About.vue'),
    meta: {title: 'About'}
  }
];

export function create{{Name}}Router() {
  return createRouter({history: createWebHashHistory(), routes});
}
`;

const VUE_PAGE_LANDING = `<script setup lang="ts">
import {createConfiguredPage} from '@lhx-kit/renderer/vue';
import {createRegistry} from '@lhx-kit/renderer';
import schema from '../render.json';
import Heading from '@/components/Heading.vue';
import Card from '@/components/Card.vue';
import Paragraph from '@/components/Paragraph.vue';

const registry = createRegistry<typeof Heading | typeof Card | typeof Paragraph>();
registry.registerAll({
  Heading: () => Heading,
  Card: () => Card,
  Paragraph: () => Paragraph
});

const RendererPage = createConfiguredPage({
  schema: schema as unknown as Parameters<typeof createConfiguredPage>[0]['schema'],
  registry: registry as unknown as Parameters<typeof createConfiguredPage>[0]['registry'],
  state: {greeting: '{{Title}}'},
  flags: {showPromo: new URLSearchParams(location.search).get('promo') === '1'}
});
</script>

<template>
  <section class="{{name}}-landing">
    <RendererPage />
    <nav class="{{name}}-landing__nav" style="margin-top: 16px;">
      <router-link to="/about">Go to About</router-link>
    </nav>
  </section>
</template>
`;

const VUE_PAGE_ABOUT = `<script setup lang="ts">
// Second in-page view for the "{{name}}" MPA entry.
</script>

<template>
  <section class="{{name}}-about">
    <h2>About this page</h2>
    <p>
      Sub-route inside the <code>{{name}}</code> MPA entry. Each MPA page
      owns its own router; other entries (e.g. <code>/settings/</code>)
      are unaffected.
    </p>
    <router-link to="/">Back to landing</router-link>
  </section>
</template>
`;

/* ---- React page templates ------------------------------------------- */

const REACT_PAGE_ENTRY = `import {createRoot} from 'react-dom/client';
import {{{Name}}Router} from './router';
import {bootstrap} from '@/bootstrap';

void bootstrap().then(() => {
  const root = document.getElementById('app');
  if (root) createRoot(root).render(<{{Name}}Router />);
});
`;

const REACT_PAGE_ROUTER = `import type {ReactElement} from 'react';
import {lazy, Suspense} from 'react';
import {HashRouter, Route, Routes} from 'react-router-dom';

const {{Name}}Landing = lazy(() => import('./views/{{Name}}Landing'));
const {{Name}}About = lazy(() => import('./views/{{Name}}About'));

/**
 * Router scoped to the "{{name}}" MPA page. HashRouter keeps this page
 * self-contained — no server-side URL rewrites required.
 */
export function {{Name}}Router(): ReactElement {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<{{Name}}Landing />} />
          <Route path="/about" element={<{{Name}}About />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
`;

const REACT_PAGE_LANDING = `import type {ReactElement} from 'react';
import {Link} from 'react-router-dom';
import {createConfiguredPage} from '@lhx-kit/renderer/react';
import {createRegistry} from '@lhx-kit/renderer';
import schema from '../render.json';
import {Heading} from '@/components/Heading';
import {Card} from '@/components/Card';
import {Paragraph} from '@/components/Paragraph';

const registry = createRegistry<typeof Heading | typeof Card | typeof Paragraph>();
registry.registerAll({
  Heading: () => Heading,
  Card: () => Card,
  Paragraph: () => Paragraph
});

const RendererPage = createConfiguredPage({
  schema: schema as unknown as Parameters<typeof createConfiguredPage>[0]['schema'],
  registry: registry as unknown as Parameters<typeof createConfiguredPage>[0]['registry'],
  state: {greeting: '{{Title}}'},
  flags: {showPromo: new URLSearchParams(location.search).get('promo') === '1'}
});

export default function {{Name}}Landing(): ReactElement {
  return (
    <section className="{{name}}-landing">
      <RendererPage />
      <nav className="{{name}}-landing__nav" style={{marginTop: 16}}>
        <Link to="/about">Go to About</Link>
      </nav>
    </section>
  );
}
`;

const REACT_PAGE_ABOUT = `import type {ReactElement} from 'react';
import {Link} from 'react-router-dom';

export default function {{Name}}About(): ReactElement {
  return (
    <section className="{{name}}-about">
      <h2>About this page</h2>
      <p>Sub-route inside the "{{name}}" MPA entry. Each MPA page owns its own router.</p>
      <nav style={{marginTop: 16}}>
        <Link to="/">Back to Landing</Link>
      </nav>
    </section>
  );
}
`;

/* ---- Page-local render schema (new canonical location) -------------- */

const PAGE_RENDER_JSON = `{
  "version": 1,
  "name": "{{name}}",
  "components": [
    {
      "name": "Heading",
      "id": "page-title",
      "props": {"level": 1, "text": {"$": "state.greeting"}}
    },
    {
      "name": "Card",
      "id": "intro",
      "props": {"title": "Hello"},
      "children": [
        {"name": "Paragraph", "props": {"text": "This page is rendered from render.json by @lhx-kit/renderer."}},
        {"name": "Paragraph", "props": {"text": "Edit src/pages/{{name}}/render.json and refresh to see the change."}}
      ]
    },
    {
      "name": "Card",
      "id": "promo",
      "when": {"eq": [{"$": "flags.showPromo"}, true]},
      "props": {"title": "Promo"},
      "children": [
        {"name": "Paragraph", "props": {"text": "Append ?promo=1 to reveal this card."}}
      ]
    }
  ]
}
`;

const VUE_COMPONENT = `<script setup lang="ts">
defineProps<{title?: string}>();
</script>

<template>
  <div class="lhx-{{name}}">
    <slot>{{ title }}</slot>
  </div>
</template>
`;

const REACT_COMPONENT = `import type {ReactElement, ReactNode} from 'react';

interface {{Name}}Props {
  title?: string;
  children?: ReactNode;
}

export function {{Name}}({title, children}: {{Name}}Props): ReactElement {
  return <div className="lhx-{{name}}">{children ?? title}</div>;
}
`;

const API_TS = `/**
 * Auto-generated by \`lhx-cli add api {{name}}\`. Adjust to your request layer.
 */
export async function {{camelName}}() {
  const response = await fetch('/api/{{name}}');
  if (!response.ok) throw new Error(\`{{name}} request failed: \${response.status}\`);
  return response.json();
}
`;

const SERVICE_TS = `/**
 * Auto-generated by \`lhx-cli add service {{name}}\`.
 * Wrap API calls / business flows for the {{name}} domain here.
 */
export class {{Name}}Service {
  async list() { return []; }
}

export const {{camelName}}Service = new {{Name}}Service();
`;

const VUE_STORE_TS = `import {defineStore} from 'pinia';

export const use{{Name}}Store = defineStore('{{camelName}}', {
  state: () => ({
    // TODO: replace with real state
    value: 0 as number
  }),
  actions: {
    set(value: number) { this.value = value; }
  }
});
`;

const REACT_STORE_TS = `import {create} from 'zustand';

interface {{Name}}State {
  value: number;
  set(value: number): void;
}

export const use{{Name}}Store = create<{{Name}}State>((setState) => ({
  value: 0,
  set: (value) => setState({value})
}));
`;

const SCHEMA_JSON = `{
  "version": 1,
  "name": "{{name}}",
  "components": []
}
`;

const MODULE_TS = `export function {{camelName}}() {
  return '{{name}} module';
}
`;

/* ----------------------------- helpers ----------------------------- */

function toPascal(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function toCamel(name: string): string {
  const pascal = toPascal(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toTitle(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}

async function writeNewFile(absolute: string, body: string): Promise<boolean> {
  if (existsSync(absolute)) {
    warn(`file already exists: ${absolute}`);
    return false;
  }
  await fse.ensureDir(dirname(absolute));
  await fse.writeFile(absolute, body);
  return true;
}

function pagesDir(project: ResolvedProjectConfig): string {
  return project.pagesDir;
}

function srcDir(project: ResolvedProjectConfig): string {
  return project.srcDir;
}

/* ----------------------------- command ----------------------------- */

/* --------------------------- interactive ------------------------- */

function isInteractive(): boolean {
  // Only prompt when connected to a real TTY; avoid stalling CI pipelines.
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function onCancel(): void {
  muted('cancelled.');
  process.exit(130);
}

function kebabOk(name: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(name);
}

async function promptKind(): Promise<AddKind> {
  const res = await prompts(
    {
      type: 'select',
      name: 'kind',
      message: 'What do you want to generate?',
      choices: ALL_KINDS.map(k => ({title: k, description: KIND_DESCRIPTIONS[k], value: k})),
      initial: 0
    },
    {onCancel}
  );
  return res.kind as AddKind;
}

async function promptName(kind: AddKind, existingPages?: Set<string>): Promise<string> {
  const res = await prompts(
    {
      type: 'text',
      name: 'name',
      message: `Name for the new ${kind}`,
      validate: value => {
        if (!value) return 'Name is required.';
        if (kind === 'page' && !kebabOk(value)) return 'Use lowercase kebab-case (e.g. "order-list").';
        if (kind === 'page' && existingPages?.has(value)) return `Page "${value}" already exists.`;
        return true;
      }
    },
    {onCancel}
  );
  return (res.name as string).trim();
}

async function promptPageExtras(): Promise<{title?: string; offline?: boolean}> {
  const res = await prompts(
    [
      {
        type: 'text',
        name: 'title',
        message: 'Page title (shown in <title>)',
        initial: ''
      },
      {
        type: 'toggle',
        name: 'offline',
        message: 'Include this page in the offline package?',
        initial: false,
        active: 'yes',
        inactive: 'no'
      }
    ],
    {onCancel}
  );
  return {
    title: typeof res.title === 'string' && res.title.trim() ? res.title.trim() : undefined,
    offline: res.offline === true
  };
}

/* ----------------------------- command ----------------------------- */

export async function runAddCommand(
  context: CliContext,
  kindArg: AddKind | undefined,
  nameArg: string | undefined,
  options: AddOptions = {}
): Promise<void> {
  // `add package` operates on a monorepo's packages/ directory and does NOT
  // require the invoking cwd to be an lhx-kit project. All other kinds DO
  // require a project (they edit project.config.ts or files inside src/).
  // We resolve `kind` FIRST so we can take the right branch.
  let kind = kindArg;
  if (!kind) {
    if (options.yes || !isInteractive()) {
      throw new Error(`Missing <kind>. Provide one of: ${ALL_KINDS.join(' | ')}, or omit --yes to run interactively.`);
    }
    kind = await promptKind();
  }
  if (!ALL_KINDS.includes(kind)) {
    throw new Error(`Unsupported add kind "${kind}". Available: ${ALL_KINDS.join(' | ')}`);
  }

  // ---- package branch: monorepo scaffolding, no project.config.ts needed ----
  if (kind === 'package') {
    let pkgName = nameArg;
    if (!pkgName) {
      if (options.yes || !isInteractive()) {
        throw new Error('Missing <name> for `add package`. Example: lhx-cli add package my-pkg');
      }
      pkgName = await promptPackageName();
    }
    await addPackage(context, pkgName, options);
    return;
  }

  // ---- project-level branch: everything else below requires project ----
  const {project, offline} = await requireProject(context.cwd);
  const cfg = project.config;
  const framework = cfg.framework;

  // Resolve `name`.
  let name = nameArg;
  if (!name) {
    if (options.yes || !isInteractive()) {
      throw new Error(`Missing <name> for \`add ${kind}\`.`);
    }
    const existingPages = new Set(Object.keys(cfg.pages));
    name = await promptName(kind, kind === 'page' ? existingPages : undefined);
  }

  // For `add page`, also give the user a chance to set title + offline when
  // running interactively and nothing was passed on the CLI.
  let effectiveOptions: AddOptions = options;
  if (kind === 'page' && !options.yes && isInteractive() && !options.title && options.offline === undefined) {
    const extras = await promptPageExtras();
    effectiveOptions = {...options, ...extras};
  }

  switch (kind) {
    case 'page':
      await addPage(context, project, offline?.file ?? null, name, effectiveOptions);
      return;
    case 'component':
      await addComponent(context, cfg, name);
      return;
    case 'api':
      await addFileOnly(context, `${srcDir(cfg)}/api/${name}.ts`, API_TS, name);
      return;
    case 'service':
      await addFileOnly(context, `${srcDir(cfg)}/services/${name}.ts`, SERVICE_TS, name);
      return;
    case 'store':
      await addFileOnly(
        context,
        `${srcDir(cfg)}/stores/${name}.ts`,
        framework === 'react' ? REACT_STORE_TS : VUE_STORE_TS,
        name
      );
      return;
    case 'schema':
      // New canonical location: `src/pages/<name>/render.json`. If the page
      // directory already exists we write there; otherwise we fall back to
      // the legacy `src/schemas/<name>.json` so users migrating existing
      // projects aren't surprised by a missing folder.
      {
        const pageDirAbs = join(cfg.rootDir, `${pagesDir(cfg)}/${name}`);
        const target = existsSync(pageDirAbs)
          ? `${pagesDir(cfg)}/${name}/render.json`
          : `${srcDir(cfg)}/schemas/${name}.json`;
        await addFileOnly(context, target, SCHEMA_JSON, name);
      }
      return;
    case 'module':
      await addFileOnly(context, `${srcDir(cfg)}/modules/${name}.ts`, MODULE_TS, name);
      return;
  }
}

async function addPage(
  context: CliContext,
  project: {file: string; config: ResolvedProjectConfig},
  offlineFilePath: string | null,
  name: string,
  options: AddOptions
): Promise<void> {
  const cfg = project.config;
  const isReact = cfg.framework === 'react';
  section(`add page ${name}`);

  const vars = {
    name,
    Name: toPascal(name),
    camelName: toCamel(name),
    Title: options.title ?? toTitle(name)
  };
  const pageRoot = `${pagesDir(cfg)}/${name}`;

  // 1. Scaffold the full page directory on disk first. If any write fails
  //    we bail before mutating project.config.ts to keep state consistent.
  //
  //    Layout (both frameworks):
  //      src/pages/<name>/
  //        ├── entry.(ts|tsx)        — bootstrap + mount router
  //        ├── router.(ts|tsx)       — HashRouter with / and /about routes
  //        ├── render.json           — renderer schema for the landing view
  //        └── views/
  //            ├── <Name>Landing.(vue|tsx)
  //            └── <Name>About.(vue|tsx)
  const files: Array<{rel: string; body: string}> = isReact
    ? [
        {rel: `${pageRoot}/entry.tsx`, body: applyTemplate(REACT_PAGE_ENTRY, vars)},
        {rel: `${pageRoot}/router.tsx`, body: applyTemplate(REACT_PAGE_ROUTER, vars)},
        {rel: `${pageRoot}/render.json`, body: applyTemplate(PAGE_RENDER_JSON, vars)},
        {rel: `${pageRoot}/views/${vars.Name}Landing.tsx`, body: applyTemplate(REACT_PAGE_LANDING, vars)},
        {rel: `${pageRoot}/views/${vars.Name}About.tsx`, body: applyTemplate(REACT_PAGE_ABOUT, vars)}
      ]
    : [
        {rel: `${pageRoot}/entry.ts`, body: applyTemplate(VUE_PAGE_ENTRY, vars)},
        {rel: `${pageRoot}/router.ts`, body: applyTemplate(VUE_PAGE_ROUTER, vars)},
        {rel: `${pageRoot}/render.json`, body: applyTemplate(PAGE_RENDER_JSON, vars)},
        {rel: `${pageRoot}/views/${vars.Name}Landing.vue`, body: applyTemplate(VUE_PAGE_LANDING, vars)},
        {rel: `${pageRoot}/views/${vars.Name}About.vue`, body: applyTemplate(VUE_PAGE_ABOUT, vars)}
      ];

  let createdCount = 0;
  let skippedCount = 0;
  for (const {rel, body} of files) {
    const abs = join(cfg.rootDir, rel);
    const created = await writeNewFile(abs, body);
    if (created) {
      success(`created ${rel}`);
      createdCount++;
    } else {
      muted(`skipped (exists): ${rel}`);
      skippedCount++;
    }
  }
  if (createdCount === 0 && skippedCount === files.length) {
    warn(`page "${name}" already fully scaffolded on disk; skipping file generation.`);
  }

  // 2. Upsert into project.config.ts. ts-morph preserves existing fields
  //    if the page is already registered.
  const added = await addPageToProjectConfig(project.file, name, {
    title: options.title ?? toTitle(name),
    offline: options.offline
  });
  if (added) success(`registered page "${name}" in ${relative(context, project.file)}`);
  else muted(`page "${name}" already in project.config.ts`);

  // 3. Optionally extend offline whitelist.
  if (options.offline && offlineFilePath) {
    const result = await addWhitelistPage(offlineFilePath, name);
    if (result.updated) {
      success(`added "${name}" to offline.whitelistPages`);
    } else if (result.reason === 'already-present') {
      muted(`"${name}" already in offline.whitelistPages`);
    } else {
      warn(`could not update offline.config.ts (${result.reason}); please add "${name}" to whitelistPages manually.`);
    }
  } else if (options.offline && !offlineFilePath) {
    warn('--offline was passed but no offline.config.ts was found; page flag is set but no whitelist to update.');
  }

  info(`next: \`lhx-cli dev --page=${name}\` to preview, edit \`${pageRoot}/render.json\` to tweak the schema`);
}

async function addComponent(_context: CliContext, cfg: ResolvedProjectConfig, name: string): Promise<void> {
  section(`add component ${name}`);
  const isReact = cfg.framework === 'react';
  const ext = isReact ? 'tsx' : 'vue';
  const target = `${srcDir(cfg)}/components/${toPascal(name)}.${ext}`;
  const abs = join(cfg.rootDir, target);
  const vars = {name, Name: toPascal(name), camelName: toCamel(name), Title: toTitle(name)};
  const body = applyTemplate(isReact ? REACT_COMPONENT : VUE_COMPONENT, vars);
  const ok = await writeNewFile(abs, body);
  if (ok) success(`created ${target}`);
}

async function addFileOnly(context: CliContext, targetRel: string, template: string, name: string): Promise<void> {
  section(`add ${targetRel}`);
  const {project} = await requireProject(context.cwd);
  const absolute = join(project.config.rootDir, targetRel);
  const vars = {name, Name: toPascal(name), camelName: toCamel(name), Title: toTitle(name)};
  const body = applyTemplate(template, vars);
  const ok = await writeNewFile(absolute, body);
  if (ok) success(`created ${targetRel}`);
}

function relative(context: CliContext, absolute: string): string {
  const cwd = context.cwd;
  if (absolute.startsWith(cwd)) {
    return absolute.slice(cwd.length + 1);
  }
  return absolute;
}

/* --------------------------- add package --------------------------- */

/**
 * Locate the nearest monorepo root (has both `pnpm-workspace.yaml` and a
 * `packages/` directory) by walking up from cwd. Returns null when not in a
 * monorepo — `addPackage` then falls back to an advisory message instead of
 * throwing, since users might run `lhx-cli add package` inside a regular
 * project by mistake and deserve clear guidance.
 */
function findMonorepoRoot(startDir: string): string | null {
  let dir = startDir;
  // Walk up at most 10 levels — enough for any realistic nesting.
  for (let i = 0; i < 10; i += 1) {
    const workspaceYaml = join(dir, 'pnpm-workspace.yaml');
    const packagesDir = join(dir, 'packages');
    if (existsSync(workspaceYaml) && existsSync(packagesDir)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached fs root
    dir = parent;
  }
  return null;
}

async function promptPackageName(): Promise<string> {
  const res = await prompts(
    {
      type: 'text',
      name: 'name',
      message: 'Package name (short form, e.g. "my-pkg" — final name will be @lhx-kit/my-pkg)',
      validate: value => {
        if (!value) return 'Name is required.';
        if (!kebabOk(value)) return 'Use lowercase kebab-case (e.g. "my-pkg").';
        return true;
      }
    },
    {onCancel}
  );
  return (res.name as string).trim();
}

/**
 * Scaffold a new publishable workspace under `packages/<name>`.
 *
 * Creates a minimal TS library pre-wired for the lhx-kit monorepo conventions:
 *   - package.json with correct `@lhx-kit/<name>` identity, ESM exports,
 *     `files` allowlist, `publishConfig.access=public`, tsup + typecheck
 *     scripts, workspace-level devDependencies on `@lhx-kit/tsconfig`.
 *   - tsconfig.json extending `@lhx-kit/tsconfig/library.json`.
 *   - tsup.config.ts using our standard ESM dual-build settings.
 *   - src/index.ts with a starter named export.
 *   - README.md + README.zh-CN.md skeletons that mention install + link back
 *     to the docs site.
 *   - LICENSE referencing MIT (Changesets will use this on publish).
 *
 * NOT created:
 *   - CHANGELOG.md — owned by Changesets. Writing one here would confuse
 *     `changeset version` into treating it as a stale changelog file.
 *   - tests/ — intentional; keep the starter minimal. Users can add after.
 *
 * Post-scaffold, the function nudges the user toward the three follow-ups
 * that every new package needs (pnpm install, write changeset, configure
 * Trusted Publisher on first publish).
 */
async function addPackage(context: CliContext, name: string, options: AddOptions): Promise<void> {
  section(`add package ${name}`);

  if (!kebabOk(name)) {
    throw new Error(`Package name "${name}" must be lowercase kebab-case (e.g. "my-pkg").`);
  }

  // Monorepo detection: must find a pnpm workspace root above cwd.
  const repoRoot = findMonorepoRoot(context.cwd);
  if (!repoRoot) {
    warn('add package: not running inside a pnpm monorepo.');
    info('Detected missing `pnpm-workspace.yaml` or `packages/` up from cwd.');
    info('');
    info('This command scaffolds a workspace under packages/<name>/. You probably want:');
    info('  • For a single-app project:        lhx-cli add module <name>');
    info('  • For a brand-new project:         lhx-cli create <name>');
    info('  • If you DO want a monorepo here:  cd into its root first, then retry.');
    throw new Error('add package requires a pnpm monorepo root.');
  }

  const pkgDir = join(repoRoot, 'packages', name);
  if (existsSync(pkgDir)) {
    if (options.force) {
      warn(`packages/${name} already exists — overwriting because --force is set.`);
      await fse.remove(pkgDir);
    } else {
      throw new Error(`packages/${name} already exists. Pass --force to overwrite.`);
    }
  }

  // Infer the scope from the root package.json's name when it's scoped;
  // otherwise default to @lhx-kit. This lets forks use their own scope
  // without having to patch the CLI.
  const rootPkgPath = join(repoRoot, 'package.json');
  let scope = '@lhx-kit';
  if (existsSync(rootPkgPath)) {
    try {
      const rootPkg = JSON.parse(await fse.readFile(rootPkgPath, 'utf8')) as {name?: string};
      if (rootPkg.name?.startsWith('@')) {
        scope = rootPkg.name.split('/')[0];
      }
    } catch {
      // ignore; fall back to default scope
    }
  }

  const fullName = `${scope}/${name}`;
  const description = options.description ?? `${fullName} package (scaffolded by lhx-cli add package).`;
  const vars = {
    name,
    fullName,
    scope,
    Name: toPascal(name),
    camelName: toCamel(name),
    description
  };

  await fse.ensureDir(pkgDir);
  await fse.ensureDir(join(pkgDir, 'src'));

  const files: Array<[string, string]> = [
    ['package.json', applyTemplate(PKG_PACKAGE_JSON, vars)],
    ['tsconfig.json', applyTemplate(PKG_TSCONFIG, vars)],
    ['tsup.config.ts', applyTemplate(PKG_TSUP_CONFIG, vars)],
    ['src/index.ts', applyTemplate(PKG_SRC_INDEX, vars)],
    ['README.md', applyTemplate(PKG_README, vars)],
    ['README.zh-CN.md', applyTemplate(PKG_README_ZH, vars)],
    ['LICENSE', PKG_LICENSE]
  ];

  for (const [rel, body] of files) {
    await fse.writeFile(join(pkgDir, rel), body, 'utf8');
    success(`created packages/${name}/${rel}`);
  }

  section('next steps');
  info('  1. pnpm install                                   ← link the new workspace');
  info(`  2. cd packages/${name} && pnpm build                 ← verify dist/ is produced`);
  info('  3. pnpm changeset                                 ← declare intent before first publish');
  info('  4. (one-time, per package) configure npm Trusted Publisher:');
  info(`       https://www.npmjs.com/package/${fullName}/access`);
  info('');
  muted('See https://juwenzhang.github.io/lhx-kit/engineering/release-pipeline for the full flow.');
}

/* ---- add-package templates ---- */

const PKG_PACKAGE_JSON = `{
  "name": "{{fullName}}",
  "version": "0.0.0",
  "description": "{{description}}",
  "keywords": ["lhx-kit"],
  "license": "MIT",
  "author": "luhanxin",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/juwenzhang/lhx-kit.git",
    "directory": "packages/{{name}}"
  },
  "homepage": "https://juwenzhang.github.io/lhx-kit/",
  "bugs": {
    "url": "https://github.com/juwenzhang/lhx-kit/issues"
  },
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "README.md",
    "README.zh-CN.md",
    "LICENSE",
    "package.json",
    "tsconfig.json"
  ],
  "sideEffects": false,
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "{{scope}}/tsconfig": "workspace:*",
    "@types/node": "^25.6.0",
    "tsup": "^8.3.5",
    "typescript": "^6.0.3"
  },
  "engines": {
    "node": ">=18.18.0"
  }
}
`;

const PKG_TSCONFIG = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "{{scope}}/tsconfig/library.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "ignoreDeprecations": "6.0"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
`;

const PKG_TSUP_CONFIG = `import {defineConfig} from 'tsup';

/**
 * tsup build config for {{fullName}}.
 * - ESM-only output (matches \`"type": "module"\` in package.json).
 * - Emits .d.ts via tsup's bundled dts pipeline; keep tsc for typecheck only.
 * - No minification: published tarballs should remain readable for debugging.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,
  target: 'node18'
});
`;

const PKG_SRC_INDEX = `/**
 * {{fullName}} — {{description}}
 *
 * Replace the starter export below with the real API surface for this package.
 * Remember to update README.md with usage examples before publishing.
 */

export const {{camelName}}Version = '0.0.0';

/**
 * Example helper. Delete once you add your real implementation.
 */
export function hello{{Name}}(who = 'world'): string {
  return \`Hello, \${who}! (from {{fullName}})\`;
}
`;

const PKG_README = `# {{fullName}}

> {{description}}

## Install

\`\`\`bash
npm install {{fullName}}
# or
pnpm add {{fullName}}
\`\`\`

## Usage

\`\`\`ts
import {hello{{Name}}} from '{{fullName}}';

console.log(hello{{Name}}('reader'));
\`\`\`

## Docs

See the full lhx-kit documentation: <https://juwenzhang.github.io/lhx-kit/>

## License

[MIT](./LICENSE) © luhanxin
`;

const PKG_README_ZH = `# {{fullName}}

> {{description}}

## 安装

\`\`\`bash
npm install {{fullName}}
# 或
pnpm add {{fullName}}
\`\`\`

## 用法

\`\`\`ts
import {hello{{Name}}} from '{{fullName}}';

console.log(hello{{Name}}('读者'));
\`\`\`

## 文档

完整的 lhx-kit 文档：<https://juwenzhang.github.io/lhx-kit/>

## License

[MIT](./LICENSE) © luhanxin
`;

const PKG_LICENSE = `MIT License

Copyright (c) 2026 luhanxin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
