import {evaluateCondition} from './expression';
import type {EvalContext} from './expression';
import type {PageSchema, RendererDiagnostic, SchemaPatch, VariantList} from './schema';

export interface ResolvedVariant {
  base: PageSchema;
  patches: SchemaPatch[];
  /** Which entry index won; useful for debugging. */
  entryIndex: number;
}

export function defineVariants(list: VariantList): VariantList {
  return list;
}

/**
 * Pick the first matching variant entry.
 *
 * Matching rules:
 * - Entries with a `when` expression match iff it evaluates truthy.
 * - An entry without `when` always matches (typically the fallback tail).
 *
 * If no entry matches, returns null and the caller should fall back to its
 * own default base schema (typical case: the renderer caller passes a base
 * schema independently).
 */
export function resolveVariant(
  variants: VariantList,
  ctx: EvalContext,
  onDiagnostic?: (d: RendererDiagnostic) => void
): ResolvedVariant | null {
  for (let i = 0; i < variants.length; i++) {
    const entry = variants[i];
    if (entry.when === undefined || evaluateCondition(entry.when, ctx)) {
      return {
        base: entry.use,
        patches: entry.with ?? [],
        entryIndex: i
      };
    }
  }
  onDiagnostic?.({
    level: 'info',
    code: 'renderer/no-variant-matched',
    message: 'No variant entry matched; caller should use a default schema.'
  });
  return null;
}
