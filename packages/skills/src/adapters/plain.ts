import {join} from 'node:path';
import type {LoadedSkill, SkillAdapter, SkillRenderResult} from '../types';

/**
 * Plain-markdown adapter.
 *
 * Output layout:  `<project>/docs/ai-skills/<name>.md`
 *
 * Purpose: produce a human-readable document that can be committed into any
 * project regardless of which AI assistant the team uses. No frontmatter
 * magic, no tool-specific quirks — just a titled markdown file with the
 * skill body inline. Good for:
 *   - Teams that don't standardise on one AI assistant
 *   - Public documentation sites
 *   - `git grep` friendly knowledge base
 */
export const plainAdapter: SkillAdapter = {
  id: 'plain',
  label: 'Plain Markdown (docs/ai-skills/)',
  targetDir: 'docs/ai-skills',

  render(skill: LoadedSkill, projectRoot: string): SkillRenderResult {
    const {manifest, body} = skill;
    const filePath = join(projectRoot, 'docs', 'ai-skills', `${manifest.name}.md`);

    const header = [
      `# ${manifest.title}`,
      '',
      `> ${manifest.description}`,
      '',
      manifest.tags.length ? `**Tags:** ${manifest.tags.map(t => `\`${t}\``).join(' · ')}` : '',
      manifest.triggers.length ? `**Triggers:** ${manifest.triggers.map(t => `"${t}"`).join(' · ')}` : '',
      ''
    ]
      .filter(Boolean)
      .join('\n');

    const references = manifest.references.length
      ? ['', '## References', '', ...manifest.references.map(r => `- [${r.title}](${r.url})`), ''].join('\n')
      : '';

    return {
      filePath,
      content: `${header}\n---\n\n${body.trimEnd()}\n${references}`
    };
  }
};
