import {z} from 'zod';

/**
 * Agent-agnostic skill manifest. The same metadata feeds every adapter —
 * CodeBuddy's SKILL.md frontmatter, Cursor's `.cursor/rules/*.mdc` frontmatter,
 * Claude Code's skill format, and plain-markdown docs.
 *
 * Design rationale: every AI coding assistant today has converged on the same
 * three pieces of metadata (who/when/scope) even if the file format differs.
 * Capturing them once lets us fan out.
 *
 * Fields:
 *   - name:         Unique, kebab-case identifier. Becomes the directory name.
 *   - title:        Human-readable label shown in pickers.
 *   - description:  One-paragraph summary (<=200 chars). Both humans and LLMs
 *                   read this to decide whether to engage the skill.
 *   - version:      SemVer. Bumped when content changes materially.
 *   - tags:         Free-form topic labels for filtering / search.
 *   - triggers:     Phrases that SHOULD cause an agent to load this skill.
 *                   Feeds Cursor's `description`, CodeBuddy's "when to use".
 *   - globs:        Optional file patterns this skill applies to. Cursor uses
 *                   these for auto-attach; other adapters use them as hints.
 *   - alwaysApply:  When true, Cursor's `alwaysApply: true` frontmatter is
 *                   emitted. Reserve for cross-cutting skills (conventions).
 *   - references:   Related doc URLs (our rspress site). Appended to output.
 *   - command:      Optional. When a skill maps onto a concrete `lhx-cli`
 *                   invocation, authors may declare the canonical form here
 *                   (e.g. `lhx-cli add package <name>`). Behaviour-type skills
 *                   (add-page, offline-packaging, create-package) should fill
 *                   this so agents know which CLI command to prefer over
 *                   hand-editing. Knowledge-only skills (troubleshooting,
 *                   mobile-adaptation) leave it undefined.
 */
export const SkillManifestSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  description: z.string().min(1).max(400),
  version: z.string().default('0.1.0'),
  tags: z.array(z.string()).default([]),
  triggers: z.array(z.string()).default([]),
  globs: z.array(z.string()).default([]),
  alwaysApply: z.boolean().default(false),
  references: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url()
      })
    )
    .default([]),
  command: z.string().min(1).optional()
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

/**
 * A skill as it lives on disk inside this package: manifest + raw body text.
 * `bodyPath` is kept so adapters can stream/copy the source file when useful.
 */
export interface LoadedSkill {
  manifest: SkillManifest;
  body: string;
  sourceDir: string;
  bodyPath: string;
}

/**
 * Canonical list of known target agents. Adding a new one = one adapter file
 * and one entry here; no change to skill authors' workflow.
 */
export type SkillTarget = 'codebuddy' | 'cursor' | 'claude' | 'plain';

export interface SkillRenderResult {
  /** Absolute path the adapter would write to. */
  filePath: string;
  /** Final file content. */
  content: string;
}

export interface SkillAdapter {
  id: SkillTarget;
  /** Short human label used in CLI pickers. */
  label: string;
  /** Directory (relative to project root) where outputs land. */
  targetDir: string;
  /**
   * Produce a writable representation for this adapter. The caller decides
   * whether to actually write it (CLI does, tests don't).
   */
  render(skill: LoadedSkill, projectRoot: string): SkillRenderResult | SkillRenderResult[];
}
