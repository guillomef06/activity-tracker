import type { Route } from '@angular/router';

import { superAdminGuard } from './core/guards/auth.guard';
import { routes } from './app.routes';
import { SuperAdminCalendarPage } from './pages/super-admin/calendar/super-admin-calendar.page';

const findChild = (parent: Route | undefined, path: string): Route | undefined =>
  parent?.children?.find(child => child.path === path);

describe('app routes', () => {
  const superAdminRoute = findChild(
    routes.find(route => route.path === 'app'),
    'super-admin'
  );

  it('should guard the super-admin branch with superAdminGuard', () => {
    expect(superAdminRoute?.canActivate).toContain(superAdminGuard);
  });

  it('should declare the calendar route as a lazy child of the guarded super-admin branch', () => {
    const calendarRoute = findChild(superAdminRoute, 'calendar');

    expect(calendarRoute).toBeDefined();
    expect(typeof calendarRoute?.loadComponent).toBe('function');
  });

  it('should lazy-load SuperAdminCalendarPage on the calendar route', async () => {
    const calendarRoute = findChild(superAdminRoute, 'calendar');

    const component = await (calendarRoute?.loadComponent as () => Promise<unknown>)();

    expect(component).toBe(SuperAdminCalendarPage);
  });
});
