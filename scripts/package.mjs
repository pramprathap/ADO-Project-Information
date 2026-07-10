/**
 * Packages the built extension into a .vsix under dist-package/ using tfx-cli.
 *
 * Runs AFTER `prepackage` (typecheck, lint, test, build, validate:manifest), so
 * this script only performs the final packaging step. Fails fast on any error.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'dist-package');

if (!existsSync(resolve(root, 'dist', 'project-information.html'))) {
  console.error('ERROR: dist/project-information.html not found. Run "npm run build" first.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const isWin = process.platform === 'win32';
const tfx = resolve(root, 'node_modules', '.bin', isWin ? 'tfx.cmd' : 'tfx');

const args = [
  'extension',
  'create',
  '--manifest-globs',
  'vss-extension.json',
  '--output-path',
  outDir,
  '--no-color',
];

console.log(`Packaging VSIX into ${outDir} ...`);
try {
  execFileSync(existsSync(tfx) ? tfx : 'tfx', args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin, // allow .cmd resolution on Windows
  });
} catch (e) {
  console.error('ERROR: tfx packaging failed.');
  console.error(e.message);
  process.exit(1);
}
console.log('VSIX package created in dist-package/.');
