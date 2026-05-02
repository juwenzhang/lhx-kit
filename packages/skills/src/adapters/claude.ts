import {join} from 'node:path';
import type {LoadedSkill, SkillAdapter, SkillRenderResult} from '../types';

/**
 * Claude Code skill adapter.
 *
 * Output layout:  `<project>/.claude/skills/<name>/SKILL.md`
 *
 * Format reference: https://docs.claude.com/en/docs/claude-code/sub-agents
 * (Claude Code's skills are closely related to sub-agents; both expect
 *  YAML frontmatter with `name` + `description`.)
 *
 * We mirror the CodeBuddy shape: SKILL.md + the original manifest side-car.
 */
export const claudeAdapter: SkillAdapter = {
  id: 'claude',
  label: 'Claude Code (.claude/skills/)',
  targetDir: '.claude/skills',

  render(skill: LoadedSkill, projectRoot: string): SkillRenderResult[] {
    const {manifest, body} = skill;
    const dir = join(projectRoot, '.claude', 'skills', manifest.name);
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
        content: `${frontmatter}${body.trimEnd()}\n${references}`
      },
      {
        filePath: join(dir, 'skill.json'),
        content: `${JSON.stringify(manifest, null, 2)}\n`
      }
    ];
  }
};
