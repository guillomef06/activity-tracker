# Activity Tracker

A mobile-first Angular application for tracking team activities with rolling 6-week scoring system. Built with Angular 19 and designed for GitHub Pages deployment.

## Features

- **Activity Input**: Users can submit activities with automated timestamp tracking
- **Management Dashboard**: View team scores on a rolling 6-week basis
- **Mobile-First Design**: Optimized for phone, tablet, and desktop
- **Real-Time Scoring**: Automatic calculation of weekly and total scores
- **User Rankings**: Sortable leaderboard with detailed breakdowns
- **Local Storage**: Activities persisted in browser localStorage

## Tech Stack

- Angular 19 (standalone components)
- TypeScript 5.6
- RxJS 7.8
- SCSS for styling
- Angular Signals for state management

## Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher

## Getting Started

### Installation

```bash
npm install
```

### Development Server

```bash
npm start
```

Navigate to `http://localhost:4200/`. The application will automatically reload on file changes.

### Build

```bash
npm run build
```

For production build with GitHub Pages base href:

```bash
npm run build:prod
```

Build artifacts are stored in the `dist/` directory.

### Running Tests

```bash
npm test
```

## Project Structure

```
src/
├── app/
│   ├── components/
│   │   ├── activity-input/       # User activity submission form
│   │   └── management-dashboard/ # Team scores and rankings
│   ├── models/
│   │   └── activity.model.ts     # Activity data interface
│   ├── services/
│   │   └── activity.service.ts   # Business logic and storage
│   ├── app.component.ts          # Root component
│   ├── app.config.ts             # App configuration
│   └── app.routes.ts             # Routing configuration
├── styles.scss                   # Global styles
└── index.html                    # Entry point
```

## Deployment to GitHub Pages

### Automatic Deployment (Recommended)

This project includes a GitHub Actions workflow for automatic deployment.

**Setup:**

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. Enable GitHub Pages in your repository:
   - Go to **Settings** → **Pages**
   - Under **Source**, select **GitHub Actions**

3. The workflow will automatically:
   - Build the app on every push to `main`
   - Deploy to `https://yourusername.github.io/activity-tracker/`

### Manual Deployment

**Using angular-cli-ghpages:**

```bash
npm run deploy
```

**Manual build and deploy:**

1. Build the project:
   ```bash
   npm run build:prod
   ```

2. Deploy the `dist/activity-tracker/browser` folder to GitHub Pages:
   ```bash
   npx angular-cli-ghpages --dir=dist/activity-tracker/browser
   ```

### Local Testing

To test the production build locally:

```bash
npm run build:prod
cd dist/activity-tracker/browser
npx http-server -p 8080
```

Navigate to `http://localhost:8080/activity-tracker/`

## Usage

### For Users

1. Navigate to the Activity Input page
2. Enter your name
3. Select activity type and complexity
4. Submit the activity
5. Activities are automatically timestamped

### For Management

1. Access the Management Dashboard
2. View team rankings based on rolling 6-week scores
3. Click on user cards to see weekly breakdowns
4. Activities include timestamps and point values
5. Refresh to reload latest data

## Scoring System

- **Simple Tasks**: 1-3 points
- **Medium Tasks**: 4-7 points
- **Complex Tasks**: 8-10+ points
- Rolling window: Last 6 weeks from current date
- Automatic weekly aggregation

## Browser Compatibility

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Development Guidelines

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for Angular development best practices and project-specific guidelines.

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
