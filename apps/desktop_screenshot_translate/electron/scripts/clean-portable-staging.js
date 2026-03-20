const fs = require('node:fs');
const path = require('node:path');

function resolveDistRoot() {
  return path.resolve(__dirname, '..', 'dist');
}

function main() {
  const distRoot = resolveDistRoot();
  if (!fs.existsSync(distRoot)) {
    console.log(`[OK] dist not present, nothing to clean for portable staging: ${distRoot}`);
    return;
  }

  const entries = fs.readdirSync(distRoot);
  const removable = entries.filter((name) => name.toLowerCase().endsWith('.nsis.7z'));

  if (removable.length === 0) {
    console.log('[OK] no NSIS staging archives to remove before portable build');
    return;
  }

  for (const name of removable) {
    const target = path.join(distRoot, name);
    fs.rmSync(target, { force: true });
    console.log(`[OK] removed NSIS staging archive ${target}`);
  }
}

main();
