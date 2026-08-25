import { Routes } from '@angular/router';
import { authGuard, adminGuard, superAdminGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Public landing page (redirects authenticated users to /app)
  {
    path: '',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/landing/landing.page').then(m => m.LandingPage),
  },

  // Authentication routes (only accessible when not logged in)
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login/login.page').then(m => m.LoginPage),
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/signup/signup.page').then(m => m.SignupPage),
  },
  {
    path: 'join',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/join/join.page').then(m => m.JoinPage),
  },
  {
    path: 'account-recovery',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/account-recovery/account-recovery.page').then(m => m.AccountRecoveryPage),
  },

  // Protected routes (require authentication)
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      // Home page (members and admins)
      {
        path: '',
        loadComponent: () => import('./pages/home/home.page').then(m => m.HomePage),
      },
      // Guides hub
      {
        path: 'guides',
        loadComponent: () => import('./pages/guides-hub/guides-hub.page').then(m => m.GuidesHubPage),
      },
      {
        path: 'guides/new',
        loadComponent: () => import('./pages/guides-hub/guide-editor/guide-editor.page').then(m => m.GuideEditorPage),
      },
      {
        path: 'guides/:id/edit',
        loadComponent: () => import('./pages/guides-hub/guide-editor/guide-editor.page').then(m => m.GuideEditorPage),
      },
      // Admin routes
      {
        path: 'server-settings',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/server-settings/server-settings.page').then(m => m.ServerSettingsPage),
      },
      // Super Admin routes
      {
        path: 'super-admin',
        canActivate: [superAdminGuard],
        children: [
          {
            path: '',
            redirectTo: 'dashboard',
            pathMatch: 'full',
          },
          {
            path: 'dashboard',
            loadComponent: () =>
              import('./pages/super-admin/dashboard/super-admin-dashboard.page').then(m => m.SuperAdminDashboardPage),
          },
          {
            path: 'servers',
            loadComponent: () =>
              import('./pages/super-admin/servers/super-admin-servers.page').then(m => m.SuperAdminServersPage),
          },
          {
            path: 'users',
            loadComponent: () =>
              import('./pages/super-admin/users/super-admin-users.page').then(m => m.SuperAdminUsersPage),
          },
          {
            path: 'guides-data',
            loadComponent: () => import('./pages/super-admin/guides-data/guides-data.page').then(m => m.GuidesDataPage),
          },
          {
            path: 'seasons',
            loadComponent: () =>
              import('./pages/super-admin/seasons/super-admin-seasons.page').then(m => m.SuperAdminSeasonsPage),
          },
        ],
      },
    ],
  },

  // Public guides routes (no auth required, wrapped in public layout with header)
  {
    path: 'guides',
    loadComponent: () =>
      import('./core/layout/public-layout/public-layout.component').then(m => m.PublicLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/guides/guides-list/guides-list.page').then(m => m.GuidesListPage),
      },
      {
        path: ':slug',
        loadComponent: () => import('./pages/guides/guide-view/guide-view.page').then(m => m.GuideViewPage),
      },
    ],
  },

  // Fallback route
  {
    path: '**',
    redirectTo: '',
  },
];
