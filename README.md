# Activity Tracker

Mobile-first Angular application for tracking alliance activity scores with a rolling 6-week system. Multi-alliance, multi-role, deployed on GitHub Pages with Supabase backend.

## Stack

- **Angular 21** — standalone components, Signals, OnPush
- **Supabase** — PostgreSQL, Auth, RLS, RPC
- **Angular Material 3** — UI components + theming
- **Vitest** — unit tests
- **GitHub Actions** — CI/CD → GitHub Pages

## Roles

| Role | Access |
|------|--------|
| `super_admin` | All alliances, all data |
| `admin` | Own alliance — settings, members, invitations, retroactive entries |
| `member` | Activity input, own scores |

## Key Features

- Activity submission with configurable point rules per position
- Participation mode per activity (toggle instead of position field)
- 6-week rolling scores + tiebreaker activity
- Admin retroactive entry + Excel batch import
- Discord webhook integration
- Account recovery via secret question (no email)
- 6 themes: Light / Dark / Auto / Glass Light / Glass Dark / High Contrast
- PWA (installable)
- i18n: EN, FR, ES, IT

## Getting Started

```bash
npm install
npm start        # dev server → http://localhost:4200
npm run build    # production build
npm test         # Vitest (watch)
npm run test:ci  # Vitest (CI, no watch)
npm run lint     # ESLint
```

## Deployment

Automatic via GitHub Actions on push to `main`. Manual:

```bash
npm run build:prod
npx angular-cli-ghpages --dir=dist/activity-tracker/browser
```

## Environment

Copy `src/environments/environment.ts` and fill in your Supabase URL and anon key for local dev. Production values are set in `environment.production.ts`.

## License

MIT
