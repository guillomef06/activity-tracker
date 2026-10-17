# Quickstart: validating 002

## Automated

```bash
npx ng test --watch=false
npx ng lint
```

Expect: new `BackToDashboardButtonComponent` spec green; servers/users/guides-data/seasons page specs assert the button; dashboard spec asserts its absence.

## Manual (needs a super-admin account)

The pages are behind `superAdminGuard` (`profile.role === 'super_admin'`). The e2e account in `.env.e2e` is a server admin and is redirected to `/app`, so these steps could not be run by the implementer.

1. `npx ng serve`, log in as a super-admin.
2. Open `/app/super-admin/servers` and `/app/super-admin/users` at 375px and 1280px: same outer padding (1rem) and max width (1400px).
3. On servers, users, guides data and seasons: the arrow button is at the start of the header; activating it (mouse, Enter, tap) opens `/app/super-admin/dashboard`; its height and width are >= 44px.
4. On the dashboard: no back button.
5. At 320px: no horizontal page overflow; the title wraps if needed.
6. Switch language (fr/en): the accessible name changes.

## Measurements

Not performed (no super-admin test account). No numbers are claimed.
