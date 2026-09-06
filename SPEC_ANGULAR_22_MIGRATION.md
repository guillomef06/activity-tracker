# Spec — Angular 22 Migration

## Tech Stack

- **Framework:** Angular 21.2.1 → 22, standalone components, Signals, OnPush
- **UI:** Angular Material / CDK
- **Tests:** Vitest (`npm run test:ci` — NOT Jasmine/Karma), lint: `npm run lint`
- **Backend:** Supabase — unaffected by this migration

---

## Context

Angular v22 (released 2026-06-03) stabilizes **Signal Forms** and **async signals (Resource API)**, and flips the framework default to zoneless + `OnPush`. This spec splits the migration into two independent phases so that a pure dependency bump is never mixed with a behavioral/API change in the same PR.

**Out of scope for this spec (deliberate):**
- **Zoneless change detection** — deferred to a future, separate effort. The project already enforces `OnPush` everywhere (existing CLAUDE.md rule), so the v22 default flip changes nothing observable, but actually removing `zone.js` (`provideZonelessChangeDetection`) is a distinct behavioral change and will be scoped separately later.

---

## Phase 1 — Dependency Upgrade (Angular 21 → 22)

**Goal: zero behavioral change.** `zone.js` stays. This is a pure version bump.

### Steps

1. Branch from `dev` (e.g. `chore/angular-22-upgrade`). Confirm baseline is green (`test:ci`, `lint`, `build:prod`) before touching anything.
2. `ng update @angular/core@22 @angular/cli@22`, then `ng update @angular/material@22 @angular/cdk@22` (official schematics, automated codemods included).
3. Manually bump the rest: `@angular/build`, `@angular-devkit/build-angular`, `angular-eslint`, `typescript-eslint`, `zone.js` (compatible patch, **not removed**), `rxjs` if required, `vitest`/`jsdom` if a test builder changes.
4. Targeted audit (no refactor):
   - Grep for `ChangeDetectionStrategy.Default` → rename to `.Eager` if found (official v22 rename).
   - Verify every component explicitly declares `changeDetection: OnPush` (already a house rule) — confirms nothing implicitly relied on the old "check always" default.
5. Fix compile errors / deprecation warnings surfaced by `ng build` and `tsc`.
6. Validation gate: `npm run lint`, `npm run test:ci`, `npm run build:prod` (`--base-href /activity-tracker/`), `npm run build:dev`.
7. Manual smoke test in browser: login, activity input, home page, offline gem calculator, alliance-settings tabs, guides. Green tests/build are not sufficient on their own per project DoD.
8. Update `DEVELOPMENT_STATUS.md` + version bump.

### Deliverable

One PR, diff essentially limited to `package.json`/`package-lock.json` plus minor compatibility fixes.

---

## Phase 2 — Signal Forms & Async Signals Migration

⚠️ Signal Forms and the Resource API are newly stabilized in v22. Official docs must be re-checked per non-trivial component rather than relying on prior knowledge — API surface and community patterns are still young.

### 2A — Signal Forms (full migration, all existing forms)

**Prerequisite — rewrite [form-validation.utils.ts](src/app/shared/utils/form-validation.utils.ts) first.** ~15+ components depend on it. It exists only because Reactive Forms isn't signal-native (it manually bridges `valueChanges`/`statusChanges` into signals via `toSignal`). With Signal Forms, `field().touched()`, `field().errors()`, `field().valid()` are already signals, so `createFieldValidSignal`/`createFieldErrorSignal` become obsolete. Validators (`usernameAvailableValidator`, `multipleOfValidator`, `passwordMatchValidator`) must be rewritten against `@angular/forms/signals` (`required`, `email`, `minLength`, custom/cross-field validators via `schemaPath`).

Target shape (official API):

```typescript
loginForm = form(signal({ email: '', password: '' }), (path) => {
  required(path.email, { message: 'Email is required' });
  email(path.email, { message: 'Enter a valid email address' });
});
```

```html
<input [formField]="loginForm.email" />
@if (loginForm.email().touched() && loginForm.email().invalid()) {
  <span class="error">{{ loginForm.email().errors()[0].message }}</span>
}
```

### Migration batches

| Batch | Files | Notes |
|---|---|---|
| 0 | `form-validation.utils.ts` | Prerequisite, migrated and tested in isolation |
| 1 — Auth | `login.page`, `signup.page`, `join.page`, `account-recovery.page` | Critical flows, pilots the pattern before wider rollout |
| 2 — Home | `activity-input.component`, `user-account-dialog.component` | |
| 3 — Server settings | `server-overview-tab`, `discord-tab`, `mg-admin-tab`, `activity-settings-tab`, `retroactive-activities-tab` | Custom validators (`multipleOfValidator`) concentrated here |
| 4 — Super-admin | `super-admin-seasons.page`, `super-admin-servers.page`, `super-admin-users.page`, `super-admin-setup.page`, guides-data tabs (`adornments`, `temperaments`, `skills`, `rings`, `gems`) | Highest file volume |
| 5 — Guides & tools | `guide-editor.page`, `champion-configurator-dialog.component`, `pack-value-calculator` + `pack-item-row` | |

Each batch: migration + Vitest specs updated together, before moving to the next batch.

**Documentation follow-up:** the project's [CLAUDE.md](CLAUDE.md) "Forms" section currently mandates Reactive Forms explicitly — must be rewritten for Signal Forms once this phase completes, so future work doesn't regress to the old pattern.

### 2B — Async Signals (Resource API / `rxResource`)

`resource()`/`rxResource()` are designed for **reactive data fetching** (loading/error/value state), not generic event streams. The 16 files currently using RxJS must be classified before conversion — a blind conversion would produce worse code for non-data-fetch cases.

| Category | Files | Approach |
|---|---|---|
| Good fit — reactive data fetching | `activity-settings-tab`, `retroactive-activities-tab`, `super-admin-seasons.page`, `guide-editor.page`, `guide-view.page`, `champion-configurator-dialog.component`, related Supabase-backed services | Convert to `resource()` (own async loader) or `rxResource()` (wraps existing Observable-returning service methods) |
| Edge case — event/side-effect streams, not "data to load" | `pwa.service.ts` (`beforeinstallprompt` and similar browser events), `snackbar.service.ts` (notification queue), `release-notes.service.ts` | Evaluate case by case: keep `toSignal()` (already used elsewhere in the project) or `rxResource` only if it genuinely fits — decision made explicit per file rather than forced |

Same validation gate as 2A (specs + `DEVELOPMENT_STATUS.md` + lint + tests, run once at the end of the phase).

---

## Decisions & Constraints

| # | Decision |
|---|----------|
| 1 | **Phase 1 and Phase 2 are separate PRs/efforts.** Phase 1 must merge and stabilize on `dev` before Phase 2 starts — isolates the risk of a pure dependency bump from a large functional refactor. |
| 2 | **`zone.js` is kept in Phase 1.** Zoneless adoption is explicitly deferred to a future, separate spec. |
| 3 | **Signal Forms migration is complete, not incremental** — all ~30 existing Reactive Forms components migrate in Phase 2, batched by risk/complexity for reviewability, not spread out indefinitely. |
| 4 | **All RxJS candidates are evaluated for Resource API conversion**, but genuine event/side-effect streams (not data-fetch) may be kept on `toSignal()`/RxJS if `resource()`/`rxResource()` would be a worse fit — documented per file, not silently skipped. |
| 5 | **`form-validation.utils.ts` migrates first**, before any component batch, since most of Phase 2A depends on it. |
