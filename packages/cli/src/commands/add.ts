import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import fse from 'fs-extra';
import prompts from 'prompts';
import {addPageToProjectConfig, addWhitelistPage} from '../ast/project-config';
import type {CliContext} from '../context';
import {type ResolvedProjectConfig, requireProject} from '../project';
import {info, muted, section, success, warn} from '../ui';

export type AddKind = 'page' | 'component' | 'api' | 'service' | 'store' | 'schema' | 'module';

export interface AddOptions {
  /** For `add page`: override the human-readable title. */
  title?: string;
  /** For `add page`: also register the page under offline whitelist. */
  offline?: boolean;
  /** Non-interactive mode; all required args must come from the CLI. */
  yes?: boolean;
}

const ALL_KINDS: AddKind[] = ['page', 'component', 'api', 'service', 'store', 'schema', 'module'];

const KIND_DESCRIPTIONS: Record<AddKind, string> = {
  page: 'A multi-page entry (upserts into project.config.ts)',
  component: 'A reusable UI component',
  api: 'An HTTP API wrapper',
  service: 'A domain service class',
  store: 'A state store (Pinia for vue3, Zustand for react)',
  schema: 'A renderer v1 JSON schema scaffold',
  module: 'A plain TypeScript module'
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
  const {project, offline} = await requireProject(context.cwd);
  const cfg = project.config;
  const framework = cfg.framework;

  // Resolve `kind` — prompt if missing and interactive, else hard fail.
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
