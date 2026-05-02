import {join} from 'node:path';
import type {LoadedSkill, SkillAdapter, SkillRenderResult} from '../types';

/**
 * Cursor rule adapter.
 *
 * Output layout:  `<project>/.cursor/rules/<name>.mdc`
 *
 * Format reference: https://docs.cursor.com/context/rules
 * Frontmatter keys recognised by Cursor:
 *   - `description`  — shown in the picker AND fed to the model so it can
 *                       decide whether to consult the rule for a given task.
 *   - `globs`        — comma-separated glob patterns; when the user edits a
 *                       matching file, this rule is auto-attached.
 *   - `alwaysApply`  — `true` forces the rule into every request.
 *
 * Design note: Cursor uses `.mdc` (MDC = Markdown Components). Plain
 * markdown is a valid subset, so we don't emit JSX — keeps files portable.
 */
export const cursorAdapter: SkillAdapter = {
  id: 'cursor',
  label: 'Cursor (.cursor/rules/)',
  targetDir: '.cursor/rules',

  render(skill: LoadedSkill, projectRoot: string): SkillRenderResult {
    const {manifest, body} = skill;
    const filePath = join(projectRoot, '.cursor', 'rules', `${manifest.name}.mdc`);

    const front: string[] = ['---'];
    front.push(`description: ${JSON.stringify(manifest.description)}`);
    if (manifest.globs.length > 0) {
      front.push(`globs: ${manifest.globs.join(',')}`);
    }
    if (manifest.alwaysApply) {
      front.push('alwaysApply: true');
    }
    front.push('---', '');

    const references = manifest.references.length
      ? ['', '## References', '', ...manifest.references.map(r => `- [${r.title}](${r.url})`), ''].join('\n')
      : '';

    return {
      filePath,
      content: `${front.join('\n')}${body.trimEnd()}\n${references}`
    };
  }
};
