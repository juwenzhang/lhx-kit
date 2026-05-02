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
import type {CliContext} from '../context';
import {deriveOfflineConfig, formatOfflineZipName, type HybridType} from '../offline-adapter';
import {requireProject} from '../project';
import {error, info, section, success, warn} from '../ui';

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
  if (result.largeAssets.length) {
    info('top assets:');
    for (const asset of result.largeAssets) info(`  - ${asset.path} ${formatBytes(asset.size)}`);
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
