import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = path.resolve(import.meta.dirname, '..', '..');
const tauriConfigPath = path.join(rootDir, 'packages/gui/src-tauri/tauri.conf.json');
const tauriConfigDir = path.dirname(tauriConfigPath);
const tauriConfig = readJson('packages/gui/src-tauri/tauri.conf.json');
const cargoManifest = fs.readFileSync(
  path.join(rootDir, 'packages/gui/src-tauri/Cargo.toml'),
  'utf8',
);

const bundleVersion = resolveBundleVersion(
  tauriConfig.version,
  tauriConfigDir,
  cargoManifest,
);
const productName = tauriConfig.productName;
const refName = process.env.GITHUB_REF_NAME ?? '';
const runNumber = process.env.GITHUB_RUN_NUMBER ?? '0';
const artifactVersion = refName.startsWith('v') ? refName : `dev-${runNumber}`;

const command = process.argv[2] ?? 'print-json';

switch (command) {
  case 'artifact-version':
    process.stdout.write(artifactVersion);
    break;
  case 'bundle-version':
    process.stdout.write(bundleVersion);
    break;
  case 'product-name':
    process.stdout.write(productName);
    break;
  case 'validate':
    if (refName.startsWith('v') && refName.slice(1) !== bundleVersion) {
      fail(
        `Tag ${refName} does not match GUI bundle version ${bundleVersion}. ` +
        'Update the version source used by packages/gui/src-tauri/tauri.conf.json.',
      );
    }
    process.stdout.write(
      JSON.stringify({ bundleVersion, artifactVersion, productName }, null, 2),
    );
    break;
  case 'print-json':
    process.stdout.write(
      JSON.stringify({ bundleVersion, artifactVersion, productName }, null, 2),
    );
    break;
  default:
    fail(`Unknown command: ${command}`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function readCargoVersion(manifest) {
  const match = manifest.match(/^version\s*=\s*"([^"]+)"\s*$/m);
  if (!match) {
    fail('Unable to read version from packages/gui/src-tauri/Cargo.toml');
  }
  return match[1];
}

function resolveBundleVersion(versionValue, configDir, cargoManifest) {
  if (typeof versionValue === 'string' && versionValue.trim().length > 0) {
    const normalized = versionValue.trim();
    if (normalized.endsWith('.json')) {
      const packageJsonPath = path.resolve(configDir, normalized);
      if (!fs.existsSync(packageJsonPath)) {
        fail(`Unable to find version package.json: ${normalized}`);
      }
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (typeof packageJson.version !== 'string' || !packageJson.version.trim()) {
        fail(`Missing version field in ${normalized}`);
      }
      return packageJson.version.trim();
    }
    return normalized;
  }

  return readCargoVersion(cargoManifest);
}

function fail(message) {
  throw new Error(message);
}
