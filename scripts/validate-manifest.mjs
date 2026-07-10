/**
 * Validates vss-extension.json before packaging. Fails (non-zero exit) if the
 * manifest is malformed or missing required pieces, so `npm run package` stops
 * early with a clear message.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const manifestPath = resolve(root, 'vss-extension.json');

const errors = [];
const warnings = [];

if (!existsSync(manifestPath)) {
  console.error('ERROR: vss-extension.json not found.');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error(`ERROR: vss-extension.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

const required = ['manifestVersion', 'id', 'publisher', 'version', 'name', 'scopes', 'contributions'];
for (const key of required) {
  if (manifest[key] === undefined || manifest[key] === null) {
    errors.push(`Missing required field: "${key}".`);
  }
}

if (manifest.publisher === 'PLACEHOLDER_PUBLISHER_ID') {
  warnings.push(
    'Publisher is still "PLACEHOLDER_PUBLISHER_ID". Set your Marketplace publisher id before publishing.',
  );
}

if (!/^\d+\.\d+\.\d+$/.test(String(manifest.version ?? ''))) {
  errors.push(`Version "${manifest.version}" must be semantic (e.g. 1.0.0).`);
}

const REQUIRED_SCOPES = ['vso.project', 'vso.project_write', 'vso.graph'];
const scopes = Array.isArray(manifest.scopes) ? manifest.scopes : [];
for (const scope of REQUIRED_SCOPES) {
  if (!scopes.includes(scope)) {
    errors.push(`Missing required scope: "${scope}".`);
  }
}

const contributions = Array.isArray(manifest.contributions) ? manifest.contributions : [];
const hub = contributions.find((c) => c.type === 'ms.vss-web.hub');
if (!hub) {
  errors.push('No ms.vss-web.hub contribution found.');
} else {
  const targets = hub.targets ?? [];
  if (!targets.includes('ms.vss-web.project-admin-hub-group')) {
    errors.push('Hub must target "ms.vss-web.project-admin-hub-group".');
  }
  const uri = hub.properties?.uri;
  if (!uri) {
    errors.push('Hub contribution is missing properties.uri.');
  } else if (!existsSync(resolve(root, uri))) {
    warnings.push(
      `Hub uri "${uri}" does not exist yet. Run "npm run build" before packaging so the file is present.`,
    );
  }
}

// Files referenced by the manifest should exist (post-build).
for (const file of manifest.files ?? []) {
  if (file.path && !existsSync(resolve(root, file.path))) {
    warnings.push(`Referenced file "${file.path}" does not exist yet (build it before packaging).`);
  }
}

for (const w of warnings) {
  console.warn(`WARN: ${w}`);
}
if (errors.length > 0) {
  for (const e of errors) {
    console.error(`ERROR: ${e}`);
  }
  console.error(`\nManifest validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log('Manifest validation passed.');
