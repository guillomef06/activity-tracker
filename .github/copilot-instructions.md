# Senior Angular Developer Guidelines

## Project Overview
This is an Angular activity tracking application with mobile-first design for GitHub Pages deployment.
Users can input activities and management can view scores on a rolling 6-week basis.

## Angular Best Practices

### Modern Angular Patterns (v18+)
- Use standalone components exclusively (avoid NgModules)
- Prefer Angular Signals over RxJS for state management when appropriate
- Use `inject()` function for dependency injection in constructors
- Leverage control flow syntax (`@if`, `@for`, `@switch`) over structural directives
- Use `input()` and `output()` for component inputs/outputs when possible
- Implement lazy loading for routes using dynamic imports

### Component Architecture
- Keep components small and focused (Single Responsibility Principle)
- Use smart/dumb (container/presentational) component pattern
- Smart components: handle state, business logic, service calls
- Dumb components: pure presentation, inputs/outputs only
- Implement OnPush change detection strategy for performance
- Use trackBy functions with `@for` loops

### TypeScript Standards
- Enable strict mode in tsconfig.json
- Use explicit typing (avoid `any`)
- Leverage interfaces and types for data structures
- Use readonly properties where applicable
- Implement proper null checks and optional chaining
- Use generic types for reusable components and services

### RxJS Best Practices
- Always unsubscribe from observables (use `takeUntilDestroyed()` or async pipe)
- Prefer async pipe in templates over manual subscriptions
- Use RxJS operators for data transformation (map, filter, switchMap, etc.)
- Avoid nested subscriptions - use higher-order operators
- Use BehaviorSubject/ReplaySubject for shared state when needed
- Implement proper error handling with catchError operator

### Mobile-First Design
- Start with mobile breakpoints (320px) and scale up
- Use CSS Grid and Flexbox for responsive layouts
- Implement touch-friendly UI (min 44px touch targets)
- Test on various viewport sizes (mobile, tablet, desktop)
- Use relative units (rem, em, %) over fixed pixels
- Optimize for performance on mobile devices
- Consider PWA capabilities for offline support

### Code Organization
```
src/
├── app/
│   ├── components/      # Presentational components
│   ├── pages/          # Route components (smart components)
│   ├── services/       # Business logic and API calls
│   ├── models/         # TypeScript interfaces and types
│   ├── guards/         # Route guards
│   ├── interceptors/   # HTTP interceptors
│   ├── pipes/          # Custom pipes
│   └── utils/          # Helper functions and constants
```

### Service Patterns
- Provide services in component level when scoped, or 'root' for singletons
- Implement repository pattern for data access
- Use HttpClient with proper typing
- Implement caching strategies when appropriate
- Handle errors gracefully with user-friendly messages
- Use dependency injection for testability

### State Management
- For simple state: use Angular Signals or services with BehaviorSubject
- For complex state: consider NgRx or other state libraries
- Keep state immutable
- Avoid direct DOM manipulation
- Use reactive patterns throughout

### Performance Optimization
- Implement lazy loading for modules/routes
- Use OnPush change detection strategy
- Optimize bundle size (analyze with webpack-bundle-analyzer)
- Implement virtual scrolling for large lists
- Use proper trackBy functions
- Avoid heavy computations in templates
- Defer non-critical JavaScript loading

### Angular Material Best Practices
- **Always prefer Material components** over custom HTML elements when available
- Use Material Design principles for consistent UI/UX
- Import only needed Material modules to keep bundle size small
- Leverage Material theming for consistent colors and typography
- Use Material CDK for advanced behaviors (overlay, a11y, etc.)
- Implement Material form field components for all inputs
- Use Material buttons, cards, dialogs, and navigation components
- Apply Material elevation and spacing utilities
- Customize Material theme in styles.scss for brand consistency
- Use Material icons with Google Fonts or SVG icons

#### Common Material Components to Use
- **Forms**: `<mat-form-field>`, `<mat-input>`, `<mat-select>`, `<mat-checkbox>`, `<mat-radio-button>`
- **Buttons**: `<button mat-raised-button>`, `<button mat-flat-button>`, `<button mat-icon-button>`
- **Layout**: `<mat-card>`, `<mat-toolbar>`, `<mat-sidenav>`, `<mat-expansion-panel>`
- **Data**: `<mat-table>`, `<mat-list>`, `<mat-chip>`, `<mat-badge>`
- **Navigation**: `<mat-tab-group>`, `<mat-menu>`, `<mat-bottom-sheet>`
- **Feedback**: `<mat-progress-bar>`, `<mat-spinner>`, `<mat-snack-bar>`, `<mat-dialog>`
- **Indicators**: `<mat-icon>`, `<mat-badge>`, `<mat-tooltip>`

#### Material Import Pattern
```typescript
// Import specific Material modules in standalone components
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
// Only import what you need for tree-shaking
```

### Forms Best Practices
- Use Reactive Forms over Template-driven forms
- **Wrap all inputs in `<mat-form-field>`** for Material styling
- Implement proper validation (both sync and async)
- Use **Material form components** (`mat-input`, `mat-select`, etc.)
- Create reusable form controls
- Use FormBuilder for cleaner form creation
- Implement custom validators when needed
- Handle form state properly (pristine, dirty, touched, etc.)
- Use `<mat-error>` for validation messages
- Use `<mat-hint>` for helper text

### Testing Guidelines
- Write unit tests for components, services, and pipes
- Aim for >80% code coverage
- Use TestBed for component testing
- Mock dependencies in tests
- Test user interactions and edge cases
- Use Jasmine/Karma or Jest as test runner

### Accessibility (a11y)
- Use semantic HTML elements
- Implement proper ARIA labels and roles
- Ensure keyboard navigation works
- Maintain proper heading hierarchy
- Test with screen readers
- Ensure sufficient color contrast (WCAG AA standard)

### Security Best Practices
- Sanitize user inputs
- Use Angular's built-in XSS protection
- Implement proper authentication/authorization
- Store sensitive data securely
- Use HTTPS for all API calls
- Validate data on both client and server

### GitHub Pages Deployment
- Build with `--base-href` for subdirectory deployment
- Use hash routing or implement redirect rules for PathLocationStrategy
- Optimize production build (`ng build --configuration production`)
- Include 404.html for SPA routing support
- Configure angular.json for proper asset handling

### Code Style
- Follow Angular style guide (angular.io/guide/styleguide)
- Use consistent naming conventions (kebab-case for files, PascalCase for classes)
- Keep functions small and focused
- Write self-documenting code with meaningful names
- Add comments only when necessary to explain "why", not "what"
- Use ESLint/Prettier for code formatting

### Git Workflow
- Write clear, concise commit messages
- Keep commits atomic and focused
- Use meaningful branch names
- Review code before committing
- Keep the main branch deployable

## Development Commands
- `npm start` or `ng serve` - Start development server
- `ng build --configuration production` - Production build
- `ng test` - Run unit tests
- `ng lint` - Lint code
- `ng update` - Update dependencies

## When Making Changes
- Always consider mobile-first approach
- Maintain type safety
- Write clean, readable code
- Respect SOLID and YAGNI principles
- Follow established patterns in the codebase
- Test changes thoroughly
- Update documentation as needed
