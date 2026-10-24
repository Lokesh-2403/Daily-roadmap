
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const output = path.join(root, 'dist');

for (const file of ['manifest.webmanifest', 'sw.js', 'icon.svg']) {
  const from = path.join(source, file);
  const to = path.join(output, file);

  if (!fs.existsSync(from)) {
    throw new Error(`Source file not found: ${from}`);
  }

  fs.copyFileSync(from, to);
  console.log(`Copied ${file} to dist/`);
}
