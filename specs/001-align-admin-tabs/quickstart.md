# Quickstart: validate Align Admin Tabs

## Automated

```bash
npx ng test --watch=false     # specs assert the admin-tabs class wiring on both pages
npx ng lint
```

## Visual / layout (needs an authenticated admin session)

1. `npx ng serve`, sign in as a server admin (and as a super admin for guides data).
2. Open `/app/server-settings` and `/app/super-admin/guides-data`.
3. In the browser console (or Playwright `evaluate`) at 320px, 375px and 1280px viewport widths:

```js
[...document.querySelectorAll('.admin-tabs .mat-mdc-tab')].map(t => Math.round(t.getBoundingClientRect().width));
```

Expected: all values equal (tolerance 1px), `document.documentElement.scrollWidth <= innerWidth`, tab height >= 44.

## Measurements (13 Oct 2026)

Run with Playwright, logged in as the `e2e_admin` account (ERA008-DEMO server, read-only) on `/app/server-settings`, `ng serve` dev build. "Before" is the same page with the `admin-tabs` class removed from the `mat-tab-group` at runtime (Material's default layout). Tab order: Serveur, Paramètres des Activités, Activités Rétroactives, Import Excel, Discord, Évènement MG. Heights are 48px in every case.

| Viewport | Before (px) | After (px) |
|---|---|---|
| 1249 (desktop) | 146.5 / 262 / 240.6 / 177.5 / 145.3 / 196.2 | 194.7 x 6 |
| 375 (mobile) | 129.4 / 244.9 / 223.5 / 160.4 / 128.2 / 179.1 | 177.6 x 6 |

- No horizontal page scroll at either width (`scrollWidth <= innerWidth`).
- At 375px the tab header scrolls with Material's chevrons; the header is 328px wide and the tab list 1065px.
- At 375px the labels "Paramètres des Activités" and "Activités Rétroactives" are truncated with an ellipsis (text longer than the tab). Other labels fit.
- At 375px the tabs are wider than the 7.5rem basis (120px) because the tab list is laid out wider than the header and `flex-grow: 1` shares the extra space equally. Widths remain identical.
- Screenshots after the fix: `after-desktop.png`, `after-mobile.png`.
- Not measured: the super-admin "Données des guides" group (the e2e account is a server admin, not a super-admin). It uses the same `admin-tabs` class.
