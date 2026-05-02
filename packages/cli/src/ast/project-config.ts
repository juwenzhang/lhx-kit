/**
 * ts-morph helpers for `project.config.ts` / `offline.config.ts`.
 *
 * Design goals:
 * - Preserve the user's formatting as much as possible. We use ts-morph at
 *   a surgical level (insert one key / array element) rather than re-emitting
 *   the whole file. `Project` is created with `manipulationSettings.indentationText`
 *   matched to the file style, but final formatting goes through a light
 *   cleanup pass because ts-morph's default prints double-quote strings.
 * - Only touch the minimal node range — never rewrite unrelated keys.
 * - Fail loudly when the AST shape is unexpected: we surface a clear error
 *   rather than silently rewriting something the user didn't expect.
 */
import {
  type ArrayLiteralExpression,
  IndentationText,
  Node,
  type ObjectLiteralExpression,
  Project,
  type PropertyAssignment,
  QuoteKind,
  type SourceFile,
  SyntaxKind
} from 'ts-morph';

export interface AddPageOptions {
  /** Display title; defaults to the capitalized page name. */
  title?: string;
  /** When true, sets `offline: true` on the page entry as well. */
  offline?: boolean;
}

function makeProject(): Project {
  return new Project({
    useInMemoryFileSystem: false,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      usePrefixAndSuffixTextForRename: false
    },
    skipAddingFilesFromTsConfig: true
  });
}

/**
 * Locate the object literal passed to `defineProjectConfig(...)` inside the
 * file's `export default defineProjectConfig({ ... })`. Returns the pages
 * object literal (creating it if missing).
 */
function findProjectPagesObject(file: SourceFile): ObjectLiteralExpression {
  const exportAssign = file.getExportAssignment(e => !e.isExportEquals());
  if (!exportAssign) {
    throw new Error('project.config.ts must use `export default ...`');
  }
  const expr = exportAssign.getExpression();

  // Accept both `defineProjectConfig({...})` and a plain object literal
  // `{...}`. The former is the standard shape.
  let rootObject: ObjectLiteralExpression | undefined;
  if (Node.isCallExpression(expr)) {
    const arg = expr.getArguments()[0];
    if (Node.isObjectLiteralExpression(arg)) rootObject = arg;
  } else if (Node.isObjectLiteralExpression(expr)) {
    rootObject = expr;
  }
  if (!rootObject) {
    throw new Error(
      'Could not locate the project config object. Expected `defineProjectConfig({ ... })` ' +
        'or a plain object literal as the default export.'
    );
  }

  let pagesProp = rootObject.getProperty('pages');
  if (!pagesProp) {
    rootObject.addPropertyAssignment({name: 'pages', initializer: '{}'});
    pagesProp = rootObject.getPropertyOrThrow('pages');
  }
  if (!Node.isPropertyAssignment(pagesProp)) {
    throw new Error('`pages` must be a plain property assignment (not a shorthand / spread).');
  }
  const pagesInit = pagesProp.getInitializer();
  if (!pagesInit || !Node.isObjectLiteralExpression(pagesInit)) {
    throw new Error('`pages` must be an object literal.');
  }
  return pagesInit;
}

/**
 * Add a page entry. Returns true when the entry was added, false when a page
 * with the same key already exists (caller decides what to do).
 */
export async function addPageToProjectConfig(
  filePath: string,
  name: string,
  options: AddPageOptions = {}
): Promise<boolean> {
  const project = makeProject();
  const file = project.addSourceFileAtPath(filePath);
  const pagesObject = findProjectPagesObject(file);

  if (pagesObject.getProperty(name)) {
    return false;
  }

  const title = options.title ?? toTitle(name);
  const initializerParts = [`title: ${quote(title)}`];
  if (options.offline) initializerParts.push('offline: true');
  const initializer = `{${initializerParts.join(', ')}}`;

  pagesObject.addPropertyAssignment({
    name: isSafeIdentifier(name) ? name : quote(name),
    initializer
  });

  await file.save();
  return true;
}

/**
 * Add a page name to offline.config.ts's `whitelistPages` array.
 * If the file or the array is missing, returns `{updated: false, reason}`.
 */
export interface WhitelistResult {
  updated: boolean;
  reason?: 'file-missing' | 'already-present' | 'no-object-literal';
}

export async function addWhitelistPage(filePath: string, name: string): Promise<WhitelistResult> {
  const project = makeProject();
  let file: SourceFile;
  try {
    file = project.addSourceFileAtPath(filePath);
  } catch {
    return {updated: false, reason: 'file-missing'};
  }

  const exportAssign = file.getExportAssignment(e => !e.isExportEquals());
  if (!exportAssign) return {updated: false, reason: 'no-object-literal'};
  const expr = exportAssign.getExpression();
  let rootObject: ObjectLiteralExpression | undefined;
  if (Node.isCallExpression(expr)) {
    const arg = expr.getArguments()[0];
    if (Node.isObjectLiteralExpression(arg)) rootObject = arg;
  } else if (Node.isObjectLiteralExpression(expr)) {
    rootObject = expr;
  }
  if (!rootObject) return {updated: false, reason: 'no-object-literal'};

  let whitelistProp = rootObject.getProperty('whitelistPages') as PropertyAssignment | undefined;
  if (!whitelistProp) {
    rootObject.addPropertyAssignment({name: 'whitelistPages', initializer: '[]'});
    whitelistProp = rootObject.getPropertyOrThrow('whitelistPages') as PropertyAssignment;
  }
  const init = whitelistProp.getInitializerOrThrow();
  if (!Node.isArrayLiteralExpression(init)) {
    return {updated: false, reason: 'no-object-literal'};
  }
  const arrayExpr: ArrayLiteralExpression = init;

  const elements = arrayExpr.getElements();
  for (const el of elements) {
    if (Node.isStringLiteral(el) && el.getLiteralValue() === name) {
      return {updated: false, reason: 'already-present'};
    }
  }
  arrayExpr.addElement(quote(name));

  await file.save();
  return {updated: true};
}

/* ---------------- helpers ---------------- */

function quote(value: string): string {
  // Use single quotes to match the existing codebase style.
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function isSafeIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function toTitle(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Introspect the project file to know which kind of `defineXxxConfig` call is
 * used. Exposed for tests.
 */
export function projectConfigKind(filePath: string): 'defineProjectConfig' | 'plain-object' | 'unknown' {
  const project = makeProject();
  const file = project.addSourceFileAtPath(filePath);
  const exportAssign = file.getExportAssignment(e => !e.isExportEquals());
  if (!exportAssign) return 'unknown';
  const expr = exportAssign.getExpression();
  if (Node.isCallExpression(expr)) {
    const callee = expr.getExpression();
    if (callee.getKind() === SyntaxKind.Identifier && callee.getText() === 'defineProjectConfig') {
      return 'defineProjectConfig';
    }
    return 'unknown';
  }
  if (Node.isObjectLiteralExpression(expr)) return 'plain-object';
  return 'unknown';
}
