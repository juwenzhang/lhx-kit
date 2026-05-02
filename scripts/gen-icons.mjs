#!/usr/bin/env node
/**
 * Icon generator for lhx-kit.
 *
 * Usage:
 *   node scripts/gen-icons.mjs --out <outDir> [--from <avatar.{jpg,png}> | --svg <logo.svg>] [--user <githubUser>]
 *
 * Priority of sources:
 *   1. --from <file>  (local image; re-sampled with macOS `sips`)
 *   2. --user <name>  (download https://avatars.githubusercontent.com/<name>?size=512)
 *   3. --svg <file>   (rasterized via @resvg/resvg-js)
 *
 * Outputs in <outDir>:
 *   favicon.ico (multi-size 16/32/48/64/128/256)
 *   icon-{16,32,48,64,128,180,256,512}.png
 *   apple-touch-icon.png (180)
 *   logo.png (512)
 *   logo.svg (only when --svg is used)
 */

import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const argv = parseArgs(process.argv.slice(2));
if (!argv.out) {
  console.error('usage: node scripts/gen-icons.mjs --out <dir> [--from <img> | --user <github> | --svg <svg>]');
  process.exit(1);
}

const outDir = resolve(argv.out);
mkdirSync(outDir, {recursive: true});

const SIZES = [16, 32, 48, 64, 128, 180, 256, 512];
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

const sourceImage = await resolveRasterSource(argv);
const pngs = new Map();

if (sourceImage) {
  for (const size of SIZES) {
    pngs.set(size, rasterizeWithSips(sourceImage, size));
  }
} else {
  const svgPath = resolve(argv.svg);
  if (!existsSync(svgPath)) throw new Error(`svg not found: ${svgPath}`);
  const svg = readFileSync(svgPath);
  const {Resvg} = await import('@resvg/resvg-js');
  for (const size of SIZES) {
    const resvg = new Resvg(svg, {fitTo: {mode: 'width', value: size}});
    pngs.set(size, resvg.render().asPng());
  }
  writeFileSync(join(outDir, 'logo.svg'), svg);
}

for (const [size, buf] of pngs) {
  writeFileSync(join(outDir, `icon-${size}.png`), buf);
}
writeFileSync(join(outDir, 'apple-touch-icon.png'), pngs.get(180));
writeFileSync(join(outDir, 'logo.png'), pngs.get(512));
writeFileSync(join(outDir, 'favicon.ico'), buildIco(ICO_SIZES.map(s => ({size: s, data: pngs.get(s)}))));

console.log(`[gen-icons] wrote ${SIZES.length} PNGs + favicon.ico to ${outDir}`);

// --- helpers ---

function parseArgs(list) {
  const res = {};
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2);
    const next = list[i + 1];
    if (!next || next.startsWith('--')) {
      res[key] = true;
    } else {
      res[key] = next;
      i++;
    }
  }
  return res;
}

async function resolveRasterSource(args) {
  if (args.from) {
    const p = resolve(args.from);
    if (!existsSync(p)) throw new Error(`--from file not found: ${p}`);
    return p;
  }
  if (args.user) {
    const tmp = join(tmpdir(), `lhx-avatar-${Date.now()}.jpg`);
    const url = `https://avatars.githubusercontent.com/${encodeURIComponent(args.user)}?size=512`;
    console.log(`[gen-icons] downloading avatar: ${url}`);
    execFileSync('/usr/bin/curl', ['-sSLf', url, '-o', tmp], {stdio: 'inherit'});
    return tmp;
  }
  return null;
}

function rasterizeWithSips(src, size) {
  const tmp = join(tmpdir(), `lhx-icon-${size}-${Date.now()}.png`);
  execFileSync('/usr/bin/sips', ['-s', 'format', 'png', '-z', String(size), String(size), src, '--out', tmp], {
    stdio: 'pipe'
  });
  const buf = readFileSync(tmp);
  rmSync(tmp, {force: true});
  return buf;
}

// Build a multi-size favicon.ico from PNG entries (PNG-compressed ICO, widely supported).
function buildIco(entries) {
  const count = entries.length;
  const headSize = 6 + 16 * count;
  let offset = headSize;
  const head = Buffer.alloc(headSize);
  head.writeUInt16LE(0, 0); // reserved
  head.writeUInt16LE(1, 2); // type = icon
  head.writeUInt16LE(count, 4);

  entries.forEach((e, i) => {
    const pos = 6 + i * 16;
    const dim = e.size >= 256 ? 0 : e.size; // 0 means 256
    head.writeUInt8(dim, pos + 0);
    head.writeUInt8(dim, pos + 1);
    head.writeUInt8(0, pos + 2); // palette count
    head.writeUInt8(0, pos + 3); // reserved
    head.writeUInt16LE(1, pos + 4); // color planes
    head.writeUInt16LE(32, pos + 6); // bits per pixel
    head.writeUInt32LE(e.data.length, pos + 8);
    head.writeUInt32LE(offset, pos + 12);
    offset += e.data.length;
  });

  return Buffer.concat([head, ...entries.map(e => e.data)]);
}
