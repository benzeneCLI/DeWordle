const fs = require('fs');
const path = require('path');

// Required standard lifecycle scripts for all workspace packages
const REQUIRED_SCRIPTS = ['build', 'lint', 'test'];

// Workspace package directories to inspect
const PACKAGE_PATHS = [
  'frontend',
  'backend',
  'soroban/sdk/ts',
];

const rootDir = path.resolve(__dirname, '..');
let hasError = false;

console.log('🔍 Verifying workspace package.json scripts consistency...\n');

// 1. Verify root package.json
const rootPackageJsonPath = path.join(rootDir, 'package.json');
if (!fs.existsSync(rootPackageJsonPath)) {
  console.error('❌ Root package.json not found!');
  process.exit(1);
}

// 2. Inspect child packages
PACKAGE_PATHS.forEach((pkgRelativePath) => {
  const pkgJsonPath = path.join(rootDir, pkgRelativePath, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    console.error(`❌ Missing package.json in workspace: ${pkgRelativePath}`);
    hasError = true;
    return;
  }

  try {
    const pkgContent = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const scripts = pkgContent.scripts || {};
    const missingScripts = REQUIRED_SCRIPTS.filter((script) => !scripts[script]);

    if (missingScripts.length > 0) {
      console.error(
        `❌ [${pkgRelativePath}] Missing required script target(s): ${missingScripts.map((s) => `"${s}"`).join(', ')}`
      );
      hasError = true;
    } else {
      console.log(`✅ [${pkgRelativePath}] All standard scripts present (${REQUIRED_SCRIPTS.join(', ')})`);
    }
  } catch (err) {
    console.error(`❌ [${pkgRelativePath}] Error parsing package.json: ${err.message}`);
    hasError = true;
  }
});

console.log('');

if (hasError) {
  console.error('❌ Workspace script validation failed! Please ensure all child packages define standard lifecycle scripts.');
  process.exit(1);
}

console.log('🎉 All workspace package scripts are consistent and valid!');