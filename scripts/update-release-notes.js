#!/usr/bin/env node
/**
 * Automatically prepends a new empty entry to release-notes.json
 * when `npm version` is run. Fill in the entries manually after.
 */
const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const notesPath = path.join(__dirname, '../src/assets/release-notes.json');

let notes = [];
if (fs.existsSync(notesPath)) {
  notes = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
}

if (notes.find((n) => n.version === pkg.version)) {
  console.log(`release-notes.json: entry for v${pkg.version} already exists, skipping.`);
  process.exit(0);
}

const today = new Date().toISOString().split('T')[0];
notes.unshift({
  version: pkg.version,
  date: today,
  entries: [{ type: 'feature', text: { en: '', fr: '', es: '', it: '', de: '', tr: '', pt: '', el: '', ko: '', hi: '', zh: '', ku: '', ar: '', id: '' } }],
});

fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2) + '\n');
console.log(`release-notes.json: added entry for v${pkg.version} — don't forget to fill in the entries!`);
