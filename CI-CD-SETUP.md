# CI/CD & Git Flow Setup Instructions

## ✅ What Has Been Configured

### 1. Environment Files Created
- ✅ `src/environments/environment.ts` (Production)
- ✅ `src/environments/environment.development.ts` (Development)

### 2. Build Configuration Updated
- ✅ `angular.json` - Added file replacements for production builds
- ✅ `package.json` - Added CI/CD scripts (build:dev, test:ci, lint)

### 3. GitHub Actions Workflows Created
- ✅ `.github/workflows/pr-checks.yml` - Runs on PRs to dev/main
- ✅ `.github/workflows/dev-checks.yml` - Runs on pushes to dev
- ✅ `.github/workflows/deploy-production.yml` - Deploys main to GitHub Pages

### 4. Documentation
- ✅ `CONTRIBUTING.md` - Complete Git Flow guide

---

## 🚀 Next Steps (Manual Actions Required)

### Step 1: Create and Push Dev Branch

```bash
# Make sure you're on main and up-to-date
git checkout main
git pull origin main

# Create dev branch from main
git checkout -b dev

# Push dev branch to GitHub
git push -u origin dev
```

### Step 2: Configure Branch Protection on GitHub

#### Protect `main` branch:
1. Go to: **Settings** → **Branches** → **Add branch protection rule**
2. Branch name pattern: `main`
3. Enable these settings:
   - ✅ **Require a pull request before merging**
   - ✅ **Require approvals**: 1 (if working with a team)
   - ✅ **Require status checks to pass before merging**
     - Add required check: `Pre-deployment Tests`
   - ✅ **Require branches to be up to date before merging**
   - ✅ **Do not allow bypassing the above settings**
4. Click **Create** or **Save changes**

#### Protect `dev` branch (Optional for solo work):
1. Add branch protection rule
2. Branch name pattern: `dev`
3. Enable:
   - ✅ **Require a pull request before merging** (optional if solo)
   - ✅ **Require status checks to pass**: `Code Quality & Tests`

### Step 3: Commit and Push These Changes

```bash
# Add all the new files
git add .

# Commit the CI/CD setup
git commit -m "ci: add CI/CD pipeline with Git Flow strategy

- Add environment files for dev/prod configuration
- Configure angular.json with file replacements
- Add GitHub Actions workflows (PR checks, dev validation, production deployment)
- Add npm scripts for CI (build:dev, test:ci)
- Create CONTRIBUTING.md with Git Flow guide
- Split deployment workflow to include pre-deployment tests"

# Push to main (this will trigger the OLD deploy workflow one last time)
git push origin main
```

### Step 4: Delete Old Workflow File

The old workflow file `.github/workflows/deploy-gh-pages.yml` should be deleted since we created a new `deploy-production.yml`:

```bash
# Remove the old workflow
git rm .github/workflows/deploy-gh-pages.yml

# Commit the removal
git commit -m "ci: remove old deployment workflow"

# Push
git push origin main
```

### Step 5: Test the Workflow

#### Test Feature → Dev → Main Flow:

```bash
# 1. Create a test feature branch
git checkout dev
git checkout -b feature/test-ci-cd-pipeline

# 2. Make a small change (e.g., update README)
echo "Testing CI/CD pipeline" >> README.md
git add README.md
git commit -m "docs: test CI/CD pipeline"

# 3. Push the feature branch
git push -u origin feature/test-ci-cd-pipeline

# 4. Go to GitHub and create a Pull Request:
#    - Base: dev
#    - Compare: feature/test-ci-cd-pipeline
#    - The "PR Checks" workflow should run automatically

# 5. After PR checks pass, merge the PR to dev
#    - The "Dev Branch Validation" workflow should run

# 6. Create another PR from dev to main
#    - Base: main
#    - Compare: dev
#    - The "PR Checks" workflow runs again

# 7. After approval and checks pass, merge to main
#    - The "Deploy to Production" workflow runs
#    - Your app deploys to GitHub Pages
```

---

## 📋 Available NPM Scripts

After this setup, you have these commands:

```bash
# Development
npm start                  # Start dev server (uses environment.development.ts)
npm run build:dev          # Build with development configuration

# Production
npm run build:prod         # Build optimized for production (uses environment.ts)

# Testing
npm test                   # Run tests in watch mode
npm run test:ci            # Run tests once (for CI) with coverage

# Quality
npm run lint               # Run linter (returns placeholder message for now)
```

---

## 🔍 Verify Everything Works

### Local Build Test:

```bash
# Test development build
npm run build:dev

# Test production build
npm run build:prod

# Run tests in CI mode
npm run test:ci
```

All commands should complete successfully!

---

## 🎯 Git Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     Git Flow Strategy                        │
└─────────────────────────────────────────────────────────────┘

feature/my-feature ──┐
                     │
bugfix/fix-bug ──────┼──> dev ───────> main ──> 🚀 GitHub Pages
                     │     ↓            ↓
refactor/cleanup ────┘     │            │
                     Validation    Full Tests
                       Build      + Deployment
```

**Workflow:**
1. Create feature branch from `dev`
2. Work on feature locally
3. Push and create PR to `dev` → **PR Checks run**
4. Merge to `dev` → **Dev Validation runs**
5. When ready, create PR from `dev` to `main` → **PR Checks run**
6. Merge to `main` → **Tests + Production Deployment runs** 🚀

---

## ⚠️ Important Notes

### About the Old Workflow
- The file `.github/workflows/deploy-gh-pages.yml` still exists
- It should be deleted after you push these changes
- The new workflow is `.github/workflows/deploy-production.yml`

### About Linting
- The `npm run lint` command currently returns a placeholder message
- To enable real linting, run: `ng add @angular-eslint/schematics`
- This is optional but recommended for code quality

### About Testing
- Make sure Chrome or Chromium is installed for `npm run test:ci`
- Tests run with ChromeHeadless in CI mode
- Code coverage reports are generated in `coverage/` directory

### GitHub Pages Configuration
- Ensure GitHub Pages is enabled in repository settings
- Source should be: **GitHub Actions**
- URL: `https://[username].github.io/activity-tracker/`

---

## 🎉 You're All Set!

Your project now has:
- ✅ Professional Git Flow branching strategy
- ✅ Automated CI/CD pipeline
- ✅ Environment-specific configurations
- ✅ Quality gates before production deployment
- ✅ Complete documentation

Follow the Next Steps above to activate everything!

---

**Questions?** Check [CONTRIBUTING.md](CONTRIBUTING.md) for detailed workflow instructions.
