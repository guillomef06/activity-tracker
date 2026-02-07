# Contributing to Activity Tracker

Thank you for contributing! This document outlines the development workflow using Git Flow with CI/CD automation.

## 📋 Table of Contents

- [Branch Strategy](#branch-strategy)
- [Development Workflow](#development-workflow)
- [Branch Naming Conventions](#branch-naming-conventions)
- [Pull Request Process](#pull-request-process)
- [CI/CD Pipeline](#cicd-pipeline)
- [Local Development](#local-development)
- [Testing](#testing)

---

## 🌳 Branch Strategy

This project uses a **Git Flow** strategy with the following branches:

### Main Branches

- **`main`** - Production branch
  - Always deployable
  - Protected: requires PR + passing checks
  - Auto-deploys to GitHub Pages on merge
  - Never commit directly to this branch

- **`dev`** - Development/Integration branch
  - Integration branch for features
  - Protected: requires PR (optional for solo)
  - Runs validation checks on push
  - Merge to `main` when ready for production

### Supporting Branches

- **`feature/*`** - New features
- **`bugfix/*`** - Bug fixes
- **`hotfix/*`** - Emergency production fixes
- **`refactor/*`** - Code refactoring
- **`docs/*`** - Documentation updates

---

## 🚀 Development Workflow

### 1. Start a New Feature

```bash
# Make sure you're on dev and up-to-date
git checkout dev
git pull origin dev

# Create a feature branch
git checkout -b feature/my-awesome-feature

# Work on your feature
# ... make changes ...

# Commit your changes
git add .
git commit -m "feat: add awesome feature"
```

### 2. Push and Create Pull Request to `dev`

```bash
# Push your feature branch
git push origin feature/my-awesome-feature

# Go to GitHub and create a PR targeting 'dev'
# The PR checks workflow will automatically run
```

### 3. Merge to `dev` After Approval

```bash
# After PR is approved and checks pass
# Merge via GitHub UI (Squash and merge recommended)

# The dev-checks workflow will run automatically
# Validation build + tests will execute
```

### 4. Promote to Production

When `dev` is stable and ready for production:

```bash
# Create a PR from dev to main
git checkout dev
git pull origin dev

# Go to GitHub and create a PR from 'dev' to 'main'
# This will trigger pr-checks workflow

# After approval and passing checks, merge the PR
# This automatically triggers deployment to GitHub Pages
```

---

## 📝 Branch Naming Conventions

Use descriptive names following these patterns:

```bash
feature/add-user-authentication
feature/dashboard-chart-improvements
bugfix/fix-activity-points-calculation
hotfix/critical-security-patch
refactor/activity-service-cleanup
docs/update-contributing-guide
```

**Guidelines:**
- Use lowercase with hyphens
- Be descriptive but concise
- Reference issue numbers when applicable: `feature/123-add-dark-mode`

---

## 🔍 Pull Request Process

### Creating a Pull Request

1. **Ensure your branch is up-to-date**
   ```bash
   git checkout dev
   git pull origin dev
   git checkout your-branch
   git rebase dev
   ```

2. **Write a clear PR title**
   - Use conventional commits format: `feat:`, `fix:`, `refactor:`, etc.
   - Example: `feat: add weekly ranking chart component`

3. **Fill out the PR description**
   - What does this PR do?
   - Why is this change needed?
   - How was it tested?
   - Screenshots (if UI changes)

4. **Wait for automated checks**
   - ✅ Build must succeed
   - ✅ Tests must pass
   - ✅ Code coverage maintained

5. **Address review comments**
   - Make requested changes
   - Push to the same branch
   - Checks will re-run automatically

### PR Checklist

Before requesting review, ensure:

- [ ] Code builds successfully (`npm run build:dev`)
- [ ] All tests pass (`npm run test:ci`)
- [ ] No console errors or warnings
- [ ] Code follows Angular style guide
- [ ] New features have tests
- [ ] Documentation updated if needed
- [ ] Commit messages are clear and descriptive

---

## ⚙️ CI/CD Pipeline

### Automated Workflows

#### 1. **PR Checks** (`.github/workflows/pr-checks.yml`)

**Triggers:** Pull requests to `dev` or `main`

**Actions:**
- ✓ Install dependencies
- ✓ Run linter (if configured)
- ✓ Build project (development config)
- ✓ Run unit tests with coverage
- ✓ Comment on PR with results

**Status:** Must pass before merge

---

#### 2. **Dev Branch Validation** (`.github/workflows/dev-checks.yml`)

**Triggers:** Pushes to `dev` branch

**Actions:**
- ✓ Install dependencies
- ✓ Run linter (if configured)
- ✓ Build production bundle (validation)
- ✓ Run unit tests
- ✓ Upload build artifacts (7-day retention)
- ✓ Show build statistics

**Purpose:** Validate that dev branch can be promoted to production

---

#### 3. **Production Deployment** (`.github/workflows/deploy-production.yml`)

**Triggers:** Pushes to `main` branch (merges only)

**Actions:**
1. **Test Job:**
   - ✓ Run linter
   - ✓ Run unit tests

2. **Build Job:**
   - ✓ Build production bundle
   - ✓ Create 404.html for SPA routing
   - ✓ Upload artifacts

3. **Deploy Job:**
   - ✓ Deploy to GitHub Pages
   - ✓ Update production URL

**Result:** Live on https://your-username.github.io/activity-tracker/

---

## 💻 Local Development

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/your-username/management.git
cd management

# Install dependencies
npm install

# Start development server
npm start
```

### Available Commands

```bash
# Development
npm start                  # Start dev server (http://localhost:4200)
npm run build:dev          # Build with development config
npm run watch              # Build and watch for changes

# Production
npm run build:prod         # Build for production (with /activity-tracker/ base href)

# Testing
npm test                   # Run tests in watch mode
npm run test:ci            # Run tests once with code coverage (for CI)

# Quality
npm run lint               # Run linter (when configured)

# Deployment
npm run deploy             # Deploy to GitHub Pages (manual)
```

### Environment Configuration

- **Development:** Uses `src/environments/environment.development.ts`
  - Debug enabled
  - Mock data enabled
  - Local API URL: `http://localhost:8080/api`

- **Production:** Uses `src/environments/environment.ts`
  - Debugging disabled
  - Optimized bundle
  - Production API URL (to be configured)

---

## 🧪 Testing

### Running Tests Locally

```bash
# Watch mode (development)
npm test

# Single run (CI mode)
npm run test:ci

# With coverage report
npm run test:ci
# Open coverage/index.html in browser
```

### Writing Tests

- Follow Angular testing best practices
- Use TestBed for component testing
- Mock dependencies with jasmine spies
- Aim for >80% code coverage
- Test user interactions and edge cases

Example test structure:

```typescript
describe('MyComponent', () => {
  let component: MyComponent;
  let fixture: ComponentFixture<MyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(MyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display user name', () => {
    component.userName = 'Alice';
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('h1').textContent).toContain('Alice');
  });
});
```

---

## 🔒 Branch Protection Rules (Recommended Setup)

### For `main` branch:

1. Go to GitHub → Settings → Branches → Add rule
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require approvals: 1 (or more for teams)
   - ✅ Require status checks to pass: `quality-checks`
   - ✅ Require branches to be up to date before merging
   - ✅ Do not allow bypassing the above settings

### For `dev` branch:

1. Branch name pattern: `dev`
2. Enable (optional for solo development):
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass

---

## 📚 Additional Resources

- [Angular Style Guide](https://angular.dev/style-guide)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Git Flow Workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

## 🆘 Getting Help

If you encounter issues:

1. Check existing issues on GitHub
2. Review the CI/CD workflow logs
3. Ask in discussions (if enabled)
4. Create a new issue with details

---

## 📄 License

This project follows the repository license terms.

---

**Happy Coding! 🚀**
