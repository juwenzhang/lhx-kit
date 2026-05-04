#!/usr/bin/env node
/**
 * sync-readmes.mjs — Regenerate a consistent "footer block" in every
 * @lhx-kit/* package README.
 *
 * Design:
 *   - Idempotent. The managed region is bracketed by two markers so
 *     authors can freely write prose ABOVE the markers; the script
 *     only overwrites BETWEEN the markers.
 *   - Works without any AI — deterministic templating only.
 *   - Covers: each package's README.md + README.zh-CN.md.
 *   - DOES NOT touch the root README.md or README.zh-CN.md (those are
 *     curated by hand; this script only manages per-package boilerplate).
 *   - DOES NOT touch CLI templates' README skeletons either, because
 *     those are the STARTING point for user projects and should not
 *     ship repo-specific footer links.
 *
 * Run: pnpm sync:readmes   (or: make sync-readmes)
 *
 * Markers:
 *   <!-- lhx-readme-footer:begin -->
 *   ... managed content ...
 *   <!-- lhx-readme-footer:end -->
 *
 * If a README has no markers, the script appends a fresh managed
 * block at the end of the file (preceded by a thematic break).
 */

import {readdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

const BEGIN = '<!-- lhx-readme-footer:begin -->';
const END = '<!-- lhx-readme-footer:end -->';

// ───────────────────────── templates ─────────────────────────

/**
 * Build the English footer block for a given package.
 */
function enFooter({pkgName}) {
  const badgeSlug = encodeURIComponent(pkgName);
  return [
    BEGIN,
    '',
    '---',
    '',
    '## 📦 Install',
    '',
    '```bash',
    `npm install ${pkgName}`,
    '# or',
    `pnpm add ${pkgName}`,
    '```',
    '',
    `![npm](https://img.shields.io/npm/v/${badgeSlug}.svg) `,
    '![provenance](https://img.shields.io/badge/provenance-verified-brightgreen?logo=npm)',
    '',
    '## 📖 Docs & further reading',
    '',
    '- 🏠 Project home: <https://juwenzhang.github.io/lhx-kit/>',
    '- 📘 Package docs: [/cli/reference](https://juwenzhang.github.io/lhx-kit/cli/reference), [/guide/architecture](https://juwenzhang.github.io/lhx-kit/guide/architecture)',
    '- 🛠️ Engineering column: [/engineering/overview](https://juwenzhang.github.io/lhx-kit/engineering/overview)',
    '- 💬 Issues & discussions: <https://github.com/juwenzhang/lhx-kit/issues>',
    '',
    '## 🤝 Contributing',
    '',
    'PRs welcome. Please read [CONTRIBUTING.md](https://github.com/juwenzhang/lhx-kit/blob/master/CONTRIBUTING.md) and run `pnpm changeset` for any user-visible change. First-time contributors: look for labels `good first issue` and `help wanted`.',
    '',
    '## 📄 License',
    '',
    '[MIT](https://github.com/juwenzhang/lhx-kit/blob/master/LICENSE) © luhanxin',
    '',
    '<sub>Part of the [`@lhx-kit`](https://github.com/juwenzhang/lhx-kit) monorepo. Every release is OIDC-signed via npm Trusted Publishing — verify the provenance attestation on the npm package page.</sub>',
    '',
    END,
    ''
  ].join('\n');
}

/**
 * Chinese footer — same content, localised.
 */
function zhFooter({pkgName}) {
  const badgeSlug = encodeURIComponent(pkgName);
  return [
    BEGIN,
    '',
    '---',
    '',
    '## 📦 安装',
    '',
    '```bash',
    `npm install ${pkgName}`,
    '# 或',
    `pnpm add ${pkgName}`,
    '```',
    '',
    `![npm](https://img.shields.io/npm/v/${badgeSlug}.svg) `,
    '![provenance](https://img.shields.io/badge/provenance-verified-brightgreen?logo=npm)',
    '',
    '## 📖 文档与延伸阅读',
    '',
    '- 🏠 项目首页：<https://juwenzhang.github.io/lhx-kit/>',
    '- 📘 相关文档：[CLI 参考](https://juwenzhang.github.io/lhx-kit/cli/reference) · [架构总览](https://juwenzhang.github.io/lhx-kit/guide/architecture)',
    '- 🛠️ 工程化专栏：[/engineering/overview](https://juwenzhang.github.io/lhx-kit/engineering/overview)',
    '- 💬 Issue / 讨论区：<https://github.com/juwenzhang/lhx-kit/issues>',
    '',
    '## 🤝 参与贡献',
    '',
    '欢迎 PR！请阅读 [CONTRIBUTING.md](https://github.com/juwenzhang/lhx-kit/blob/master/CONTRIBUTING.md)，用户可见变更请用 `pnpm changeset` 声明。新手友好 label：`good first issue` / `help wanted`。',
    '',
    '## 📄 License',
    '',
    '[MIT](https://github.com/juwenzhang/lhx-kit/blob/master/LICENSE) © luhanxin',
    '',
    '<sub>属于 [`@lhx-kit`](https://github.com/juwenzhang/lhx-kit) monorepo。每次发布都经过 npm Trusted Publishing（OIDC）签名——可在 npm 包页面验证 provenance 证明。</sub>',
    '',
    END,
    ''
  ].join('\n');
}

// ───────────────────────── core ─────────────────────────

/**
 * Replace the region between markers (or append if missing).
 */
function applyFooter(source, footer) {
  const beginIdx = source.indexOf(BEGIN);
  const endIdx = source.indexOf(END);

  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    // Replace existing region.
    const before = source.slice(0, beginIdx).trimEnd();
    const after = source.slice(endIdx + END.length).trimStart();
    const tail = after ? `\n\n${after}` : '\n';
    return `${before}\n\n${footer.trimEnd()}${tail}`;
  }

  // No markers yet — append.
  const trimmed = source.trimEnd();
  return `${trimmed}\n\n${footer.trimEnd()}\n`;
}

async function processPackage(pkgDir) {
  const pkgJsonPath = join(pkgDir, 'package.json');
  let pkgJson;
  try {
    pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
  } catch {
    return {pkgDir, skipped: true, reason: 'no package.json'};
  }

  if (pkgJson.private) {
    return {pkgDir, skipped: true, reason: 'private package'};
  }
  if (!pkgJson.name?.startsWith('@lhx-kit/')) {
    return {pkgDir, skipped: true, reason: 'not @lhx-kit/* scoped'};
  }

  const shortName = pkgJson.name.split('/')[1];
  const writes = [];

  for (const [readme, factory] of [
    ['README.md', enFooter],
    ['README.zh-CN.md', zhFooter]
  ]) {
    const path = join(pkgDir, readme);
    let current;
    try {
      current = await readFile(path, 'utf8');
    } catch {
      // If the README doesn't exist yet, create a minimal one.
      current = `# ${pkgJson.name}\n\n> ${pkgJson.description || shortName}\n`;
    }
    const next = applyFooter(current, factory({pkgName: pkgJson.name, shortName}));
    if (next !== current) {
      await writeFile(path, next, 'utf8');
      writes.push(readme);
    }
  }

  return {pkgDir, pkgName: pkgJson.name, writes};
}

async function main() {
  const entries = await readdir(PACKAGES_DIR, {withFileTypes: true});
  const dirs = entries.filter(e => e.isDirectory()).map(e => join(PACKAGES_DIR, e.name));

  const results = [];
  for (const dir of dirs) {
    results.push(await processPackage(dir));
  }

  console.log(`\nsync-readmes.mjs — processed ${results.length} packages:\n`);
  for (const r of results) {
    const rel = r.pkgDir.replace(`${REPO_ROOT}/`, '');
    if (r.skipped) {
      console.log(`  ⏭  ${rel}  (skipped: ${r.reason})`);
    } else if (r.writes.length === 0) {
      console.log(`  ✓  ${rel}  (already up to date)`);
    } else {
      console.log(`  ✏️  ${rel}  → wrote: ${r.writes.join(', ')}`);
    }
  }
  console.log('');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
