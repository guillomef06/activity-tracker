# Spec — xlsx CVE Remediation

## Context

`xlsx@0.18.5` (only consumer: [import-excel-tab.component.ts](src/app/pages/server-settings/components/import-excel-tab/import-excel-tab.component.ts), parses user-uploaded files) carries 2 CVEs with no npm-registry fix — SheetJS moved distribution to their own CDN after `0.18.5`:

| Advisory | Issue | Patched in |
|---|---|---|
| [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) | Prototype pollution | `0.19.3` |
| GHSA-5pgg-2g8v-p4x9 | ReDoS | `0.20.2` |

**Decision:** install the patched SheetJS build from their CDN (same package, same API — no code change). Rejected `exceljs`: it currently has its own unresolved CVEs (transitive `uuid`/`tmp`) and low maintenance activity — no net security gain for a rewrite.

## Actions

1. `package.json`: `"xlsx": "^0.18.5"` → `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` (pin exact tarball, not `xlsx-latest`)
2. `npm install`, check lockfile resolves cleanly
3. Validation gate: lint, `test:ci`, `build:prod`, `build:dev`
4. **Manual smoke test** (Vitest specs won't catch real binary-parsing changes): upload a real `.xlsx` through the import wizard, verify the template download still opens
5. `DEVELOPMENT_STATUS.md`: close the xlsx CVE note
6. Note in the PR: `npm audit` will stop tracking `xlsx` (installed from URL, not registry) — expected, not a regression
