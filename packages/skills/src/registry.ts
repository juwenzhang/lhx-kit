import {existsSync} from 'node:fs';
import {readFile, readdir, stat} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {type LoadedSkill, SkillManifestSchema} from './types';

/**
 * Locate the bundled `skills/` directory.
 *
 * In dev (`pnpm -C packages/skills dev`) this package is imported via its
 * TypeScript source (`src/index.ts`), so `import.meta.url` resolves inside
 * `packages/skills/src/`. In a published/built package, entry is
 * `dist/index.js` which sits next to `dist/`; the `skills/` directory is
 * shipped alongside per `package.json#files`.
 *
 * We walk up looking for a sibling `skills/` directory. This also lets
 * consumers drop a local fork next to the compiled output without tweaks.
 */
export function getBundledSkillsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Candidates (in order):  <here>/../skills  <here>/../../skills
  const candidates = [resolve(here, '..', 'skills'), resolve(here, '..', '..', 'skills')];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fallback: return the most likely location even if it doesn't exist yet;
  // readdir will throw a clear error at the call site.
  return candidates[0];
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a single skill from a directory containing `skill.json` + `SKILL.md`.
 * Throws with a descriptive error when either file is missing / malformed so
 * skill-pack authors see the problem immediately at `pnpm build` time.
 */
export async function loadSkillFromDir(dir: string): Promise<LoadedSkill> {
  const manifestPath = join(dir, 'skill.json');
  const bodyPath = join(dir, 'SKILL.md');
  if (!(await exists(manifestPath))) {
    throw new Error(`[lhx-kit/skills] missing skill.json in ${dir}`);
  }
  if (!(await exists(bodyPath))) {
    throw new Error(`[lhx-kit/skills] missing SKILL.md in ${dir}`);
  }
  const manifestRaw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  const parsed = SkillManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    throw new Error(
      `[lhx-kit/skills] invalid skill.json in ${dir}:\n${parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`
    );
  }
  const body = await readFile(bodyPath, 'utf8');
  return {manifest: parsed.data, body, sourceDir: dir, bodyPath};
}

/**
 * Enumerate all skills in a root directory. A skill is any subdirectory that
 * contains `skill.json`. Unknown files are ignored so authors can stash notes
 * in the root without polluting the list.
 */
export async function listSkills(rootDir: string = getBundledSkillsDir()): Promise<LoadedSkill[]> {
  if (!(await exists(rootDir))) return [];
  const entries = await readdir(rootDir, {withFileTypes: true});
  const result: LoadedSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(rootDir, entry.name);
    if (!(await exists(join(dir, 'skill.json')))) continue;
    result.push(await loadSkillFromDir(dir));
  }
  return result.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

export async function getSkill(name: string, rootDir?: string): Promise<LoadedSkill | undefined> {
  const all = await listSkills(rootDir);
  return all.find(s => s.manifest.name === name);
}
