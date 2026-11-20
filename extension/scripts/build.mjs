// Builds the extension once and packages it for each browser family:
//   dist/chromium/  (+ dist/eidetic-chromium-<version>.zip with --zip)  (Chrome, Edge, Brave, Opera, Vivaldi, Arc)
//   dist/firefox/   (+ dist/eidetic-firefox-<version>.zip with --zip)   (Firefox 140+)
// --dev: unminified with source maps. --e2e: also dist/e2e, a Chromium build pre-granted all sites for tests.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { build } from 'vite';
import { manifest } from './manifest.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const nm = join(root, 'node_modules');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const mode = process.argv.includes('--dev') ? 'development' : 'production';
const e2e = process.argv.includes('--e2e');
// --zip: also make the store zips (npm run package). A normal build only writes the folders.
const makeZips = process.argv.includes('--zip');

await build({ root, mode, logLevel: 'warn' });
const bundle = join(dist, 'bundle');

// OCR engine, shipped inside the extension (stores forbid remote code): the Tesseract worker, the three LSTM
// WebAssembly builds (it picks relaxed-SIMD, SIMD or plain at run time) and English language data.
// Sinhala, Tamil and other languages are data files downloaded on first use and cached.
const ocr = join(bundle, 'ocr');
mkdirSync(join(ocr, 'core'), { recursive: true });
mkdirSync(join(ocr, 'lang'), { recursive: true });
cpSync(join(nm, 'tesseract.js/dist/worker.min.js'), join(ocr, 'worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(join(nm, 'tesseract.js-core', f), join(ocr, 'core', f));
}
cpSync(join(nm, '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), join(ocr, 'lang', 'eng.traineddata.gz'));
for (const lic of ['tesseract.js/LICENSE.md', 'tesseract.js-core/LICENSE']) {
  if (existsSync(join(nm, lic))) cpSync(join(nm, lic), join(ocr, `LICENSE-${lic.split('/')[0]}.txt`));
}

const files = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));

for (const target of e2e ? ['chromium', 'firefox', 'e2e'] : ['chromium', 'firefox']) {
  const out = join(dist, target);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(bundle, out, { recursive: true });
  rmSync(join(out, 'icons', 'icon.svg'), { force: true });
  const m = manifest(target === 'e2e' ? 'chromium' : target, version);
  if (target === 'e2e') m.host_permissions = ['<all_urls>'];
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  if (target === 'e2e') {
    console.log(`e2e       ${relative(root, out)}/  (unpacked, test-only)`);
    continue;
  }
  if (!makeZips) {
    console.log(`${target.padEnd(9)} ${relative(root, out)}/`);
    continue;
  }
  // Fixed timestamps so the same source always produces a byte-identical zip.
  const entries = Object.fromEntries(files(out).map((f) => [relative(out, f).split('\\').join('/'), [readFileSync(f), { mtime: new Date('2026-01-01T00:00:00Z') }]]));
  const zip = join(dist, `eidetic-${target}-${version}.zip`);
  writeFileSync(zip, zipSync(entries, { level: 9 }));
  const mb = (statSync(zip).size / 1048576).toFixed(1);
  console.log(`${target.padEnd(9)} ${relative(root, out)}/  ->  ${relative(root, zip)}  (${Object.keys(entries).length} files, ${mb} MB)`);
}
