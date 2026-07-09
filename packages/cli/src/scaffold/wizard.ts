import * as p from '@clack/prompts';
import type {TargetMode} from '../commands/create';
import type {TemplateManifest} from './templates';

/**
 * Interactive scaffold wizard. Implements design.md §3.6: branches by template
 * type, narrows compatibility-incompatible options, supports type-to-filter on
 * lists >5, shows a summary before writing files, and lets the user cancel.
 *
 * Design intent: every step short-circuits when the user has already supplied
 * the equivalent flag. Mixed-mode is the default — pass what you know, get
 * prompted for the rest.
 */
export interface WizardInput {
  /** Whatever the user supplied via flags (project name, template, etc.). */
  partial: Partial<WizardAnswers>;
  /** Catalogue of built-in templates so the template-step can render a list. */
  templates: TemplateManifest[];
}

export interface WizardAnswers {
  projectName: string;
  template: string;
  /** Frontend only. */
  target?: TargetMode;
  /** Frontend only — UI library feature name (e.g. `ui-element-plus`). */
  ui?: string;
  /** Frontend only. */
  cssPreprocessor?: 'less' | 'sass' | 'none';
  /** Frontend only. */
  cssAtomic?: 'unocss' | 'tailwind' | 'none';
  /** Frontend only. */
  cssStyling?: 'modules' | 'styled' | 'vanilla-extract';
  /** Optional features (multi-select; excludes target/ui/css feature names). */
  features: string[];
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun';
}

/** Templates that take frontend prompts (target / UI / CSS axes). */
const FRONTEND_TEMPLATES = new Set(['vue3-mpa', 'react-mpa']);

/** Templates that take library prompts (bundler / format axes). */
const LIBRARY_TEMPLATES = new Set(['lib-single', 'lib-monorepo']);

/** Micro templates — Redis is built-in; no cache prompt. */
const MICRO_TEMPLATES = new Set(['micro']);

function isFrontendTemplate(name: string, manifest?: TemplateManifest): boolean {
  if (FRONTEND_TEMPLATES.has(name)) return true;
  return manifest?.category === 'frontend';
}

function isLibraryTemplate(name: string, manifest?: TemplateManifest): boolean {
  if (LIBRARY_TEMPLATES.has(name)) return true;
  return manifest?.category === 'library';
}

function isBackendTemplate(_name: string, manifest?: TemplateManifest): boolean {
  return manifest?.category === 'backend';
}

export async function runWizard(input: WizardInput): Promise<WizardAnswers> {
  const {partial, templates} = input;

  p.intro('🛠️  lhx-kit · scaffold a new project');

  const projectName =
    partial.projectName ??
    (await assertNotCancelled(
      p.text({
        message: 'Project name?',
        placeholder: 'my-app',
        defaultValue: 'my-app',
        validate: value => {
          if (!value) return undefined; // defaultValue applies
          if (!/^[a-zA-Z0-9-_.]+$/.test(value)) {
            return 'Only letters, digits, "-", "_", "." allowed';
          }
          return undefined;
        }
      })
    ));

  const template =
    partial.template ??
    (await assertNotCancelled(
      p.select({
        message: 'Pick a template',
        options: templates.map(t => ({
          value: t.name,
          label: `${t.title}`,
          hint: t.description.length > 70 ? `${t.description.slice(0, 67)}…` : t.description
        }))
      })
    ));

  const tplManifest = templates.find(t => t.name === template);
  const isFrontend = isFrontendTemplate(template, tplManifest);
  const isLibrary = isLibraryTemplate(template, tplManifest);
  const isBackend = isBackendTemplate(template, tplManifest);
  const isMicro = MICRO_TEMPLATES.has(template);

  let target: TargetMode | undefined = partial.target;
  let cssPreprocessor: WizardAnswers['cssPreprocessor'] = partial.cssPreprocessor;
  let cssAtomic: WizardAnswers['cssAtomic'] = partial.cssAtomic;
  let cssStyling: WizardAnswers['cssStyling'] = partial.cssStyling;

  if (isFrontend) {
    if (!target) {
      target = (await assertNotCancelled(
        p.select({
          message: 'Target deployment',
          initialValue: 'hybrid' as const,
          options: [
            {value: 'hybrid', label: 'Hybrid (PC + mobile responsive)', hint: 'default — recommended'},
            {value: 'pc', label: 'PC desktop only', hint: 'admin / SaaS'},
            {value: 'mobile', label: 'Mobile only', hint: 'rem-adaptive H5'}
          ]
        })
      )) as TargetMode;
    }

    if (!cssPreprocessor) {
      cssPreprocessor = (await assertNotCancelled(
        p.select({
          message: 'CSS preprocessor',
          initialValue: 'less' as const,
          options: [
            {value: 'less', label: 'Less', hint: 'default — CN ecosystem mainstream'},
            {value: 'sass', label: 'Sass / SCSS'},
            {value: 'none', label: 'Pure CSS'}
          ]
        })
      )) as WizardAnswers['cssPreprocessor'];
    }

    if (!cssAtomic) {
      cssAtomic = (await assertNotCancelled(
        p.select({
          message: 'CSS atomic system',
          initialValue: 'unocss' as const,
          options: [
            {value: 'unocss', label: 'UnoCSS', hint: 'default — atomic, fast'},
            {value: 'tailwind', label: 'Tailwind CSS', hint: 'industry standard'},
            {value: 'none', label: 'None'}
          ]
        })
      )) as WizardAnswers['cssAtomic'];
    }

    if (!cssStyling) {
      const stylingChoices: Array<{value: string; label: string; hint?: string}> = [
        {value: 'modules', label: 'CSS Modules', hint: 'default — Vite native'}
      ];
      if (template === 'react-mpa') {
        stylingChoices.push({value: 'styled', label: 'styled-components'});
      }
      stylingChoices.push({value: 'vanilla-extract', label: 'Vanilla Extract', hint: 'zero-runtime CSS-in-TS'});

      cssStyling = (await assertNotCancelled(
        p.select({
          message: 'Component-level styling',
          initialValue: 'modules',
          options: stylingChoices
        })
      )) as WizardAnswers['cssStyling'];
    }
  }

  // UI library list is a Phase 2 deliverable. For Phase 1 the wizard skips
  // the UI prompt entirely so existing templates keep their hardcoded UI; the
  // `ui` field stays undefined and the scaffolder ignores it.
  const ui: string | undefined = partial.ui;

  // Backend templates: prompt for database and (for non-micro) cache.
  // Micro templates have Redis built-in so only db is surfaced.
  if (isBackend && !partial.features) {
    const db = await assertNotCancelled(
      p.select({
        message: 'Database',
        initialValue: 'db-pg' as const,
        options: [
          {value: 'db-pg', label: 'PostgreSQL', hint: 'default'},
          {value: 'db-mysql', label: 'MySQL 8'},
          {value: 'db-none', label: 'None'}
        ]
      })
    );

    const backendFeatures: string[] = [db as string];

    if (!isMicro) {
      const cacheChoice = await assertNotCancelled(
        p.select({
          message: 'Cache',
          initialValue: 'cache-redis' as const,
          options: [
            {value: 'cache-redis', label: 'Redis', hint: 'default'},
            {value: 'cache-none', label: 'None'}
          ]
        })
      );
      backendFeatures.push(cacheChoice as string);
    }

    (partial as {features?: string[]}).features = backendFeatures;
  }

  // Library templates: prompt for bundler + output formats.
  // The create command will auto-inject tsup+esm defaults when these are
  // absent, but surfacing them here lets users make an informed choice.
  if (isLibrary && !partial.features) {
    const bundler = await assertNotCancelled(
      p.select({
        message: 'Bundler',
        initialValue: 'bundler-tsup' as const,
        options: [
          {value: 'bundler-tsup', label: 'tsup', hint: 'default — fast dual ESM+CJS build'},
          {value: 'bundler-rslib', label: 'rslib', hint: 'Rspack-based, native UMD support'},
          {value: 'bundler-rollup', label: 'rollup', hint: 'maximum format control'}
        ]
      })
    );

    const formats = await p.multiselect({
      message: 'Output formats (space to toggle)',
      required: true,
      options: [
        {value: 'format-esm', label: 'ESM (.mjs)', hint: 'default'},
        {value: 'format-cjs', label: 'CJS (.cjs)', hint: 'Node.js require'},
        {value: 'format-umd', label: 'UMD (.umd.js)', hint: 'CDN / browser global'}
      ],
      initialValues: ['format-esm']
    });
    if (p.isCancel(formats)) await abort();

    const libFeatures = [bundler as string, ...(formats as string[])];
    // Merge into partial.features so the downstream feature reconciler picks them up.
    // We reassign features below after the inline-feature multiselect.
    (partial as {features?: string[]}).features = libFeatures;
  }

  // Optional features beyond target/ui/css. Templates that ship inline
  // `features` in their template.json get them rendered here as a multiselect.
  // Cross-template features (under templates/_features/, e.g. `offline`) are
  // discovered by the scaffolder via appliesTo, but a few high-value ones get
  // surfaced as dedicated prompts below so users don't need to memorize the
  // feature catalog.
  let features: string[] = partial.features ?? [];
  if (!partial.features && tplManifest?.features?.length) {
    const selected = await p.multiselect({
      message: 'Optional features (space to toggle, enter to confirm)',
      required: false,
      options: tplManifest.features.map(f => ({
        value: f.name,
        label: f.title,
        hint: f.description
      })),
      initialValues: tplManifest.features.filter(f => f.defaultEnabled).map(f => f.name)
    });
    if (p.isCancel(selected)) {
      await abort();
    } else {
      features = selected;
    }
  }

  // Offline packaging is offered to frontend templates whose target lands on
  // mobile or hybrid. PC-only scaffolds skip the prompt — desktop apps don't
  // ship offline zips. The user can still force it via `--features=offline`.
  if (
    !partial.features &&
    isFrontend &&
    (target === 'mobile' || target === 'hybrid') &&
    !features.includes('offline')
  ) {
    const wantsOffline = await p.confirm({
      message: 'Add offline (hybrid WebView) packaging? — adds offline.config.ts + offline:build script',
      initialValue: false
    });
    if (p.isCancel(wantsOffline)) {
      await abort();
    } else if (wantsOffline) {
      features = [...features, 'offline'];
    }
  }

  const packageManager =
    partial.packageManager ??
    ((await assertNotCancelled(
      p.select({
        message: 'Package manager',
        initialValue: 'pnpm' as const,
        options: [
          {value: 'pnpm', label: 'pnpm', hint: 'default'},
          {value: 'npm', label: 'npm'},
          {value: 'yarn', label: 'yarn'},
          {value: 'bun', label: 'bun'}
        ]
      })
    )) as WizardAnswers['packageManager']);

  // Summary
  const libBundlerFeature = features.find(f => f.startsWith('bundler-'));
  const libFormatFeatures = features.filter(f => f.startsWith('format-'));
  const dbFeature = features.find(f => f.startsWith('db-'));
  const cacheFeature = features.find(f => f.startsWith('cache-'));
  const summaryLines = [
    `Template:        ${template}`,
    isFrontend ? `Target:          ${target}` : null,
    isFrontend ? `CSS:             ${cssPreprocessor} + ${cssAtomic} + ${cssStyling}` : null,
    isLibrary && libBundlerFeature ? `Bundler:         ${libBundlerFeature.replace('bundler-', '')}` : null,
    isLibrary && libFormatFeatures.length > 0
      ? `Formats:         ${libFormatFeatures.map(f => f.replace('format-', '')).join(' + ')}`
      : null,
    isBackend && dbFeature ? `Database:        ${dbFeature.replace('db-', '')}` : null,
    isBackend && !isMicro && cacheFeature ? `Cache:           ${cacheFeature.replace('cache-', '')}` : null,
    isMicro ? 'Cache:           redis (built-in)' : null,
    `Features:        ${features.length === 0 ? '(none)' : features.join(', ')}`,
    `Package mgr:     ${packageManager}`,
    `Output:          ./${projectName}`
  ]
    .filter(Boolean)
    .join('\n');

  p.note(summaryLines, 'Ready to scaffold');

  const ok = await p.confirm({message: 'Proceed?', initialValue: true});
  if (p.isCancel(ok) || ok === false) {
    await abort();
  }

  p.outro('🚀  Generating files…');

  return {
    projectName,
    template,
    target,
    ui,
    cssPreprocessor,
    cssAtomic,
    cssStyling,
    features,
    packageManager
  };
}

async function assertNotCancelled<T>(promise: Promise<T | symbol>): Promise<T> {
  const value = await promise;
  if (p.isCancel(value)) {
    await abort();
  }
  return value as T;
}

async function abort(): Promise<never> {
  p.cancel('Scaffold aborted — no files were written.');
  process.exit(0);
}
