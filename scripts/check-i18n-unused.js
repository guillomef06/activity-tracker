#!/usr/bin/env node
/**
 * Detects translation keys defined in i18n JSON files that are not used
 * anywhere in the application source files.
 *
 * Usage:
 *   node scripts/check-i18n-unused.js
 *   node scripts/check-i18n-unused.js --locale en
 *   node scripts/check-i18n-unused.js --verbose
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const I18N_DIR = path.join(__dirname, '../src/assets/i18n');
const SRC_DIR = path.join(__dirname, '../src/app');
const SOURCE_EXTENSIONS = ['.ts', '.html'];

// Add a new locale here whenever a new language file is created.
const ALL_LOCALES = ['fr', 'en', 'es', 'it', 'de', 'tr', 'pt', 'el', 'ko', 'hi', 'zh', 'ku', 'ar', 'id'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flatten a nested JSON object into an array of dot-notation keys. */
function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value, fullKey);
    }
    return [fullKey];
  });
}

/** Recursively collect all files with the given extensions under a directory. */
function collectFiles(dir, extensions) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath, extensions);
    if (extensions.some((ext) => entry.name.endsWith(ext))) return [fullPath];
    return [];
  });
}

/** Find dynamic key prefixes — e.g. `'xx.yyy.' + variable`. */
function findDynamicPrefixes(content) {
  const prefixes = new Set();
  const addPrefix = (raw) => {
    if (!raw?.includes('.')) return;
    const normalized = raw.replace(/\.$/, '').trim();
    if (!normalized) return;
    prefixes.add(normalized);
  };

  // Matches:
  //   'some.prefix.' + var   (string literal with closing quote before +)
  //   'some.prefix' + var    (string literal without trailing dot, e.g. 'xx.yyy' + titlecase)
  //   `some.prefix.${var}`   (template literal)
  //   condition ? 'prefix.a' : 'prefix.b' + suffix
  const patterns = [
    /['"`]([\w.-]+)['"`]\s*\+/g,
    /`([\w.-]+)\.\$\{/g,
    /\?\s*['"`]([\w.-]+)['"`]\s*:\s*['"`]([\w.-]+)['"`]\s*\)?\s*\+/g,
    /\?\s*['"`]([\w.-]+)['"`]\s*:\s*['"`]([\w.-]+)['"`]/g,
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      match.slice(1).filter(Boolean).forEach(addPrefix);
    }
  }

  return prefixes;
}

/**
 * A key is only skipped when it is part of a dynamic prefix and is not explicitly
 * referenced anywhere in the source code.
 */
function isKeyCoveredByDynamicPrefix(key, dynamicPrefixes) {
  return [...dynamicPrefixes].some((prefix) => {
    if (!prefix) return false;
    return key === prefix || key.startsWith(prefix + '.') || key.startsWith(prefix);
  });
}

function shouldSkipDynamicKey(key, sourceContent, dynamicPrefixes) {
  if (sourceContent.includes(key)) return false;
  return isKeyCoveredByDynamicPrefix(key, dynamicPrefixes);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';

function runCheck() {
  const args = process.argv.slice(2);
  const localeFlag = args.indexOf('--locale');
  const locales = localeFlag !== -1 ? [args[localeFlag + 1]] : ALL_LOCALES;
  const verbose = args.includes('--verbose');

  const sourceFiles = collectFiles(SRC_DIR, SOURCE_EXTENSIONS);
  if (verbose) {
    console.log(`Scanning ${sourceFiles.length} source file(s) in ${SRC_DIR}\n`);
  }

  const sourceContent = sourceFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const dynamicPrefixes = findDynamicPrefixes(sourceContent);

  if (verbose && dynamicPrefixes.size > 0) {
    console.log('Dynamic key prefixes detected:');
    [...dynamicPrefixes].forEach((p) => console.log(`  "${p}"`));
    console.log();
  }

  let globalFailed = false;

  for (const locale of locales) {
    const localeFile = path.join(I18N_DIR, `${locale}.json`);
    if (!fs.existsSync(localeFile)) {
      console.error(`${RED}Error: locale file not found: ${localeFile}${RESET}`);
      globalFailed = true;
      continue;
    }

    const allKeys = flattenKeys(JSON.parse(fs.readFileSync(localeFile, 'utf8')));
    const unused = [];
    const skippedDynamic = [];

    for (const key of allKeys) {
      if (shouldSkipDynamicKey(key, sourceContent, dynamicPrefixes)) {
        skippedDynamic.push(key);
      } else if (!sourceContent.includes(key)) {
        unused.push(key);
      }
    }

    console.log(`${BOLD}i18n unused-key check — locale: ${locale}${RESET}`);
    console.log(`  Total keys   : ${allKeys.length}`);
    console.log(`  Scanned files: ${sourceFiles.length}`);
    console.log(`  Dynamic skip : ${skippedDynamic.length}`);
    console.log(`  ${unused.length === 0 ? GREEN : RED}Unused keys  : ${unused.length}${RESET}`);

    if (skippedDynamic.length > 0 && verbose) {
      console.log(`\n${YELLOW}Keys skipped (covered by a dynamic prefix):${RESET}`);
      skippedDynamic.forEach((k) => console.log(`  ~ ${k}`));
    }

    if (unused.length > 0) {
      console.log(`\n${RED}Unused translation keys:${RESET}`);
      unused.forEach((k) => console.log(`  ✗ ${k}`));
      globalFailed = true;
    } else {
      console.log(`\n${GREEN}All keys are used. ✓${RESET}`);
    }

    console.log();
  }

  if (globalFailed) process.exit(1);
}

if (require.main === module) {
  runCheck();
}

module.exports = {
  findDynamicPrefixes,
  isKeyCoveredByDynamicPrefix,
  shouldSkipDynamicKey,
  runCheck,
};
