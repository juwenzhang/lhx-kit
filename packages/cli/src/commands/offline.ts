import {existsSync} from 'node:fs';
import {copyFile, mkdir, rename} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {
  buildOfflinePackage,
  formatBytes,
  generateOfflineManifest,
  type InspectionResult,
  inspectOfflineOutput,
  writeOfflineManifest
} from '@lhx-kit/offline';
import {execa} from 'execa';
import {bold} from 'kolorist';
import {deriveOfflineConfig, formatOfflineZipName, type HybridType} from '../adapters/offline';
import type {CommandDescriptor} from '../core/command';
import type {CliContext} from '../core/context';
import {requireProject} from '../core/project';
import {error, info, section, success, warn} from '../utils/ui';

export interface OfflineCommandOptions {
  buildDir?: string;
  outDir?: string;
  zip?: boolean;
  skipBuild?: boolean;
  hybridType?: HybridType;
}

function printInspection(target: string, result: InspectionResult): void {
  info(`package: ${result.packageName || '(unknown)'}@${result.version || '(unknown)'}`);
  info(`target: ${target}`);
  info(`valid: ${result.valid ? 'yes' : 'no'}`);
  info(`pages: ${result.pageCount}, assets: ${result.assetCount}, size: ${formatBytes(result.totalSize)}`);
  if (result.packageHash) {
    // Print a short prefix so CI logs stay readable; the full hash is
    // still available in manifest.json for ops platforms that need it.
    const short = result.packageHash.slice(0, 12);
    const pkgSize = typeof result.packageSize === 'number' ? formatBytes(result.packageSize) : '?';
    info(`package hash: sha256:${short}… (${pkgSize})`);
  }
  if (result.largeAssets.length) {
    info('top assets:');
    for (const asset of result.largeAssets) info(`  - ${asset.path} ${formatBytes(asset.size)}`);
  }
  if (result.warnings?.length) {
    // Heuristic warnings (e.g. "page has no .js chunk") are printed but do
    // NOT flip `valid`. Callers that want CI to fail on warnings can wire
    // a `--strict` flag on top of this output in the future.
    warn(`warnings: ${result.warnings.length}`);
    for (const w of result.warnings.slice(0, 10)) warn(`  - ${w}`);
  }
  if (result.missingFiles.length) {
    warn(`missing files: ${result.missingFiles.length}`);
    for (const file of result.missingFiles.slice(0, 10)) warn(`  - ${file}`);
  }
}

async function runProjectBuild(cwd: string): Promise<void> {
  info('running pnpm build');
  const result = await execa('pnpm', ['build'], {cwd, stdio: 'inherit', reject: false});
  if (result.exitCode !== 0) throw new Error('Project build failed before offline packaging.');
}

async function resolveDerived(context: CliContext, options: OfflineCommandOptions) {
  const {project, offline} = await requireProject(context.cwd);
  if (!offline) {
    throw new Error('No offline.config.ts found next to project.config.ts.');
  }
  return deriveOfflineConfig(project.config, offline.config, {
    hybridType: options.hybridType,
    buildDir: options.buildDir,
    outDir: options.outDir
  });
}

/**
 * Rename the default `<name>-<version>.zip` produced by @lhx-kit/offline to
 * the align-spec filename policy `${YYYYMMDD}_${ts}_${hybridType}_v${version}.zip`.
 */
async function renameZipToPolicy(oldZipPath: string, hybridType: HybridType, version: string): Promise<string> {
  const targetName = formatOfflineZipName(version, hybridType);
  const targetPath = join(dirname(oldZipPath), targetName);
  if (oldZipPath === targetPath) return targetPath;
  if (existsSync(targetPath)) {
    // Prefer a fresh copy: remove stale target then rename.
    await copyFile(oldZipPath, targetPath);
    return targetPath;
  }
  await rename(oldZipPath, targetPath);
  return targetPath;
}

export async function runOfflineBuild(context: CliContext, options: OfflineCommandOptions): Promise<void> {
  const derived = await resolveDerived(context, options);
  const {config, resolvedHybridType, buildDirAbs, outDirAbs} = derived;
  if (!config.enabled) throw new Error('Offline packaging is disabled (offline.enabled=false).');

  if (!options.skipBuild) await runProjectBuild(context.cwd);
  if (!existsSync(buildDirAbs)) throw new Error(`Build output not found: ${buildDirAbs}`);

  section('offline build');
  info(`hybridType=${resolvedHybridType} version=${config.version}`);
  const result = await buildOfflinePackage({
    projectRoot: context.cwd,
    config: {...config, buildDir: buildDirAbs, outDir: outDirAbs},
    zip: options.zip !== false
  });
  success('offline package generated');
  info(`manifest: ${result.manifestPath}`);
  if (result.zipPath) {
    const finalZip = await renameZipToPolicy(result.zipPath, resolvedHybridType, config.version);
    info(`zip: ${finalZip}`);
  }
  printInspection(result.outDir, result.validation);
}

export async function runOfflineManifest(context: CliContext, options: OfflineCommandOptions): Promise<void> {
  const {config, buildDirAbs, outDirAbs} = await resolveDerived(context, options);
  if (!config.enabled) throw new Error('Offline packaging is disabled (offline.enabled=false).');
  if (!existsSync(buildDirAbs)) throw new Error(`Build output not found: ${buildDirAbs}`);
  await mkdir(outDirAbs, {recursive: true});

  section('offline manifest');
  const manifest = await generateOfflineManifest({...config, buildDir: buildDirAbs, outDir: outDirAbs}, buildDirAbs);
  const manifestPath = await writeOfflineManifest(manifest, outDirAbs);
  success(`manifest written to ${manifestPath}`);
  info(`pages: ${manifest.pages.length}, assets: ${manifest.assets.length}`);
}

export async function runOfflineInspect(context: CliContext, target?: string): Promise<void> {
  const inspectTarget = resolve(context.cwd, target || 'dist-offline');
  section('offline inspect');
  const result = await inspectOfflineOutput(inspectTarget);
  printInspection(inspectTarget, result);
  if (!result.valid) {
    error(`${result.missingFiles.length} file(s) missing`);
    process.exitCode = 1;
  }
}

export async function runOfflineDiff(): Promise<void> {
  warn('offline diff is reserved for a future release.');
  process.exitCode = 2;
}

function printOfflineHelp(): void {
  console.log(`${bold('lhx-cli offline')}`);
  console.log('  build      Build project and package dist-offline + manifest + zip');
  console.log('  manifest   Generate only manifest.json from dist');
  console.log('  inspect    Inspect dist-offline directory or zip file');
  console.log('  diff       Reserved: incremental package output');
}

/**
 * Route an `offline <action> [target]` invocation to the right runner. When no
 * action is supplied and the CLI is interactive, prompts the user; otherwise
 * prints the action menu and returns.
 */
async function runOfflineRoute(
  context: CliContext,
  action: string | undefined,
  target: string | undefined,
  options: OfflineCommandOptions & {yes?: boolean}
): Promise<void> {
  let resolvedAction = action;
  if (!resolvedAction) {
    if (options.yes || !(process.stdin.isTTY && process.stdout.isTTY)) {
      printOfflineHelp();
      return;
    }
    const picked = await (await import('prompts')).default(
      {
        type: 'select',
        name: 'action',
        message: 'Pick an offline action',
        choices: [
          {
            title: 'build',
            description: 'Run project build and package dist-offline + manifest + zip',
            value: 'build'
          },
          {title: 'manifest', description: 'Generate only manifest.json from dist', value: 'manifest'},
          {title: 'inspect', description: 'Inspect a dist-offline directory or zip file', value: 'inspect'},
          {title: 'diff', description: 'Reserved: incremental package output', value: 'diff'}
        ]
      },
      {onCancel: () => process.exit(130)}
    );
    resolvedAction = picked.action as string | undefined;
    if (!resolvedAction) return;
  }
  switch (resolvedAction) {
    case 'build':
      await runOfflineBuild(context, options);
      return;
    case 'manifest':
      await runOfflineManifest(context, options);
      return;
    case 'inspect':
      await runOfflineInspect(context, target);
      return;
    case 'diff':
      await runOfflineDiff();
      return;
    default:
      printOfflineHelp();
  }
}

export const offlineCommand: CommandDescriptor = {
  name: 'offline [action] [target]',
  description: 'Offline packaging: build | manifest | inspect | diff',
  options: [
    {flags: '--build-dir <dir>', description: 'Override build directory'},
    {flags: '--out-dir <dir>', description: 'Override offline output directory'},
    {flags: '--no-zip', description: 'Skip zip generation for offline build'},
    {flags: '--skip-build', description: 'Skip automatic pnpm build when running offline build'},
    {flags: '--hybrid-type <type>', description: 'Which version track to package (test | prod)'},
    {flags: '--yes', description: 'Non-interactive mode'}
  ],
  run: (context, action, target, options) =>
    runOfflineRoute(
      context,
      action as string | undefined,
      target as string | undefined,
      options as OfflineCommandOptions & {yes?: boolean}
    )
};
