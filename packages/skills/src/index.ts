/**
 * @lhx-kit/skills — agent-agnostic skill pack.
 *
 * A skill is a piece of procedural knowledge packaged as (skill.json + SKILL.md).
 * Adapters transform the canonical form into the shape that specific AI coding
 * assistants expect (CodeBuddy, Cursor, Claude Code, or plain Markdown).
 *
 * Typical usage from a CLI / script:
 *
 *   import { listSkills, installSkills } from '@lhx-kit/skills';
 *   const skills = await listSkills();                    // enumerate built-ins
 *   await installSkills(skills, {
 *     projectRoot: process.cwd(),
 *     targets: ['codebuddy', 'cursor'],
 *   });                                                   // write to disk
 */
import {existsSync} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

import {claudeAdapter} from './adapters/claude';
import {codebuddyAdapter} from './adapters/codebuddy';
import {cursorAdapter} from './adapters/cursor';
import {plainAdapter} from './adapters/plain';
import type {LoadedSkill, SkillAdapter, SkillRenderResult, SkillTarget} from './types';

export {claudeAdapter} from './adapters/claude';
export {codebuddyAdapter} from './adapters/codebuddy';
export {cursorAdapter} from './adapters/cursor';
export {plainAdapter} from './adapters/plain';
export * from './registry';
export * from './types';

/**
 * Registry of known adapters keyed by target id. New adapters slot in here
 * and are immediately exposed to all call sites (CLI, programmatic install).
 */
export const adapters: Record<SkillTarget, SkillAdapter> = {
  codebuddy: codebuddyAdapter,
  cursor: cursorAdapter,
  claude: claudeAdapter,
  plain: plainAdapter
};

export function getAdapter(target: SkillTarget): SkillAdapter {
  const adapter = adapters[target];
  if (!adapter) {
    throw new Error(`[lhx-kit/skills] unknown target: ${target}`);
  }
  return adapter;
}

export function getAvailableTargets(): SkillTarget[] {
  return Object.keys(adapters) as SkillTarget[];
}

/** Render a single skill for a single target. */
export function renderSkill(skill: LoadedSkill, target: SkillTarget, projectRoot: string): SkillRenderResult[] {
  const adapter = getAdapter(target);
  const out = adapter.render(skill, projectRoot);
  return Array.isArray(out) ? out : [out];
}

export interface InstallOptions {
  projectRoot: string;
  targets: SkillTarget[];
  /**
   * When true, files that already exist on disk are left untouched. Defaults
   * to false: we overwrite, because skill content is sourced from this
   * package and drifting copies defeat the purpose.
   */
  skipIfExists?: boolean;
}

export interface InstallResult {
  written: string[];
  skipped: string[];
}

/**
 * Render + write a list of skills to one or more targets. The function is
 * idempotent for the default path (overwrite) so re-running it is the
 * canonical way to sync after a version bump.
 */
export async function installSkills(skills: LoadedSkill[], options: InstallOptions): Promise<InstallResult> {
  const {projectRoot, targets, skipIfExists = false} = options;
  const written: string[] = [];
  const skipped: string[] = [];

  for (const target of targets) {
    const adapter = getAdapter(target);
    for (const skill of skills) {
      const results = adapter.render(skill, projectRoot);
      const outs = Array.isArray(results) ? results : [results];
      for (const out of outs) {
        if (skipIfExists) {
          if (existsSync(out.filePath)) {
            skipped.push(out.filePath);
            continue;
          }
        }
        await mkdir(dirname(out.filePath), {recursive: true});
        await writeFile(out.filePath, out.content, 'utf8');
        written.push(out.filePath);
      }
    }
  }

  return {written, skipped};
}
