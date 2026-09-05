# Angular Activity Tracker - Development Guidelines

## Project Context
Angular activity tracking application with mobile-first design for GitHub Pages deployment.
Users input activities, management views scores on rolling 6-week basis.

---

## ⚠️ DEFINITION OF DONE — OBLIGATOIRE AVANT TOUTE FIN DE TÂCHE

**Une tâche n'est pas terminée sans avoir effectué ces étapes dans l'ordre :**

1. [ ] **Tests mis à jour** — tout fichier modifié ou créé a son `.spec.ts` correspondant à jour
2. [ ] **`DEVELOPMENT_STATUS.md` mis à jour** — feature marquée comme complète, nouveaux fichiers listés, limitations connues notées
3. [ ] **Aucune régression** — les tests existants passent toujours
4. [ ] **Lint OK** — le lint ne doit pas etre en erreur

> Ces étapes sont non négociables. Si elles ne sont pas réalisées, la tâche n'est pas terminée.

---

## Critical Rules

### Component File Structure
- **ALWAYS use separate files** for TS, HTML, and SCSS (never inline templates/styles)
- Each component requires 4 files:
  - `component-name.component.ts` - Logic
  - `component-name.component.html` - Template
  - `component-name.component.scss` - Styles
  - `component-name.component.spec.ts` - Tests
- Use `templateUrl` and `styleUrl`, never inline `template` or `styles`
- Organize in dedicated folders:
  ```
  my-component/
  ├── my-component.component.ts
  ├── my-component.component.html
  ├── my-component.component.scss
  └── my-component.component.spec.ts
  ```

### Strict Prohibitions
- **NEVER use `::ng-deep`** - Use proper Angular encapsulation or global styles
- **NEVER use functions in templates** (e.g., `{{ myFunction() }}` or `[prop]="myFunction()"`). Use signals, variables, or getters instead

### Tests
- **Tout nouveau composant ou service doit avoir un fichier `.spec.ts`**
- **Toute modification de logique métier doit se refléter dans les tests existants**
- Les tests doivent couvrir les cas nominaux et les cas d'erreur principaux

### Material Design First
- **Always prefer Material components** over custom HTML when available
- Use: `mat-form-field`, `mat-input`, `mat-button`, `mat-card`, `mat-select`, etc.
- Import only needed Material modules for tree-shaking
- Wrap all form inputs in `<mat-form-field>`
- Use `<mat-error>` for validation, `<mat-hint>` for helper text

## Angular Modern Patterns (v18+)

### Architecture
- Use **standalone components exclusively** (no NgModules)
- Prefer **Angular Signals** over RxJS for state management
- Use `resource()` (own async loader) or `rxResource()` (wraps an Observable-returning service method) for reactive data fetching — loading/error/value state comes for free. Keep RxJS/`toSignal()` only for genuine event or side-effect streams that don't fit a load/reload model (browser events, notification queues) — document the choice with a short comment when a file could plausibly go either way
- Use `inject()` function for dependency injection
- Leverage control flow: `@if`, `@for`, `@switch` (not `*ngIf`, `*ngFor`, `*ngSwitch`)
- Use `input()` and `output()` for component inputs/outputs
- Implement lazy loading with dynamic imports

### Component Design
- Smart/dumb pattern:
  - Smart: handle state, business logic, service calls
  - Dumb: pure presentation, inputs/outputs only
- Use OnPush change detection strategy
- Use `trackBy` functions with `@for` loops
- Keep components small and focused (SRP)

### TypeScript
- Explicit typing (avoid `any`)
- Use interfaces/types for data structures
- Implement proper null checks and optional chaining
- Use readonly properties where applicable

### RxJS
- Always unsubscribe (use `takeUntilDestroyed()` or async pipe)
- Prefer async pipe in templates
- Avoid nested subscriptions - use higher-order operators
- Implement proper error handling with `catchError`

## Forms
- Use **Signal Forms** (`@angular/forms/signals`) — not Reactive Forms, not template-driven
- Build with `form(signal({...}), (path) => { ... })`; register validators (`required`, `email`, `minLength`, custom/cross-field via `validate()`/`validateAsync()`) inside the schema function
- Bind inputs with `[formField]="myForm.fieldName"`, wrapped in `<mat-form-field>` — `mat-select`/`mat-slide-toggle` (ControlValueAccessor) work natively with `[formField]`, no compatibility layer needed
- Field state (`field().touched()`, `field().errors()`, `field().valid()`, `field().dirty()`) is already signal-based — read it directly in a `computed()`, never bridge it through `toSignal()`
- Shared validators and the error-key → i18n mapping live in `src/app/shared/utils/form-validation.utils.ts` — reuse them instead of duplicating validation logic per component
- Use `<mat-error>` for validation, `<mat-hint>` for helper text

## Mobile-First Design
- Start with 320px breakpoint, scale up
- Touch-friendly UI (min 44px touch targets)
- Use CSS Grid/Flexbox for responsive layouts
- Use relative units (rem, em, %) over px

## Accessibility
- Use semantic HTML
- Implement ARIA labels/roles
- Ensure keyboard navigation
- Maintain heading hierarchy
- Sufficient color contrast (WCAG AA)

## Security
- Sanitize user inputs
- Use Angular's built-in XSS protection
- Implement proper auth/authz
- HTTPS for all API calls
- Validate data client and server side

## GitHub Pages Deployment
- Build with `--base-href` for subdirectory deployment
- Use hash routing or implement redirect rules
- Include 404.html for SPA routing support
- Production build: `ng build --configuration production`

## Code Style
- Follow Angular style guide
- Naming: kebab-case for files, PascalCase for classes
- Keep functions small and focused
- Self-documenting code with meaningful names
- Comments explain "why", not "what"
- Use ESLint/Prettier

## Git Workflow
- Clear, concise commit messages
- Atomic, focused commits
- Meaningful branch names
- Code review before commit
- Keep main branch deployable