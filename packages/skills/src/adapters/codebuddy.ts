import {join} from 'node:path';
import type {LoadedSkill, SkillAdapter, SkillRenderResult} from '../types';

/**
 * CodeBuddy skill adapter.
 *
 * Output layout:  `<project>/.codebuddy/skills/<name>/SKILL.md`
 *
 * Format reference: https://www.codebuddy.ai/docs
 * Required YAML frontmatter keys: `name`, `description`.
 * We ALSO write `skill.json` alongside so the original manifest survives —
 * CodeBuddy ignores unknown files, and keeping the manifest makes round-trip
 * re-export / diff trivial.
 */
export const codebuddyAdapter: SkillAdapter = {
  id: 'codebuddy',
  label: 'CodeBuddy (.codebuddy/skills/)',
  targetDir: '.codebuddy/skills',

  render(skill: LoadedSkill, projectRoot: string): SkillRenderResult[] {
    const {manifest, body} = skill;
    const dir = join(projectRoot, '.codebuddy', 'skills', manifest.name);
    const frontmatter = [
      '---',
      `name: ${manifest.name}`,
      `description: ${JSON.stringify(manifest.description)}`,
      '---',
      ''
    ].join('\n');

    const references = manifest.references.length
      ? ['', '## References', '', ...manifest.references.map(r => `- [${r.title}](${r.url})`), ''].join('\n')
      : '';

    return [
      {
        filePath: join(dir, 'SKILL.md'),
        content: `${frontmatter}\n${body.trimStart().trimEnd()}\n${references}`
      },
      {
        filePath: join(dir, 'skill.json'),
        content: `${JSON.stringify(manifest, null, 2)}\n`
      }
    ];
  }
};
