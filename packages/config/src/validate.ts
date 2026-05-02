import {existsSync, statSync} from 'node:fs';
import {absolutePageEntry, resolveAliasTarget} from './defaults';
import type {Diagnostic} from './diagnostics';
import {extractPlaceholders} from './helpers';
import type {ResolvedOfflineConfig, ResolvedProjectConfig} from './schema';

/**
 * Cross-validate project + offline config against the filesystem.
 * Returns a list of diagnostics; the caller decides how to render them (doctor/info/CI).
 */
export function validateAgainstFilesystem(
  project: ResolvedProjectConfig,
  offline: ResolvedOfflineConfig | null
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // 1. Each page entry file exists.
  for (const page of Object.values(project.pages)) {
    const entryPath = absolutePageEntry(project, page);
    if (!existsSync(entryPath)) {
      diagnostics.push({
        level: 'error',
        code: 'project-config/missing-entry',
        message: `Page "${page.name}" entry file does not exist: ${entryPath}`,
        path: ['pages', page.name, 'entry']
      });
    }
  }

  // 2. Each alias target exists.
  for (const [alias, target] of Object.entries(project.aliases)) {
    const full = resolveAliasTarget(project.rootDir, target);
    if (!existsSync(full)) {
      diagnostics.push({
        level: 'warn',
        code: 'project-config/missing-alias-target',
        message: `Alias "${alias}" target does not exist: ${full}`,
        path: ['aliases', alias]
      });
      continue;
    }
    if (!statSync(full).isDirectory()) {
      diagnostics.push({
        level: 'warn',
        code: 'project-config/alias-not-directory',
        message: `Alias "${alias}" target is not a directory: ${full}`,
        path: ['aliases', alias]
      });
    }
  }

  // 3. Each env declares apiBase when runtime/request module is expected to consume it.
  //    We do not know here whether a project actually uses the runtime, so we emit warnings
  //    rather than errors.
  for (const [mode, entry] of Object.entries(project.envs)) {
    if (!entry) continue;
    if (!entry.apiBase) {
      diagnostics.push({
        level: 'info',
        code: 'project-config/missing-api-base',
        message: `env.${mode} has no apiBase`,
        path: ['envs', mode, 'apiBase']
      });
    }
  }

  if (!offline) return diagnostics;

  // 4. offline.whitelistPages must be a subset of project.pages.
  for (const name of offline.whitelistPages ?? []) {
    if (!project.pages[name]) {
      diagnostics.push({
        level: 'error',
        code: 'offline-config/unknown-page',
        message: `offline.whitelistPages references unknown page "${name}"`,
        path: ['whitelistPages']
      });
    }
  }

  // 5. prefetch.match.page must reference a real page.
  for (const rule of offline.prefetch ?? []) {
    if ('page' in rule.match) {
      if (!project.pages[rule.match.page]) {
        diagnostics.push({
          level: 'error',
          code: 'offline-config/unknown-prefetch-page',
          message: `prefetch rule "${rule.name}" matches unknown page "${rule.match.page}"`,
          path: ['prefetch', rule.name, 'match', 'page']
        });
      }
    }

    // 6. Every ${var} in apiUrl must appear in keys.
    const placeholders = extractPlaceholders(rule.apiUrl);
    const declared = new Set(rule.keys ?? []);
    for (const ph of placeholders) {
      if (!declared.has(ph)) {
        diagnostics.push({
          level: 'error',
          code: 'offline-config/prefetch-key-missing',
          message: `prefetch rule "${rule.name}" references \${${ph}} but does not declare it in \`keys\``,
          path: ['prefetch', rule.name, 'keys']
        });
      }
    }
  }

  return diagnostics;
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some(d => d.level === 'error');
}
