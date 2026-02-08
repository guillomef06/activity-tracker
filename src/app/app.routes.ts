import { Routes } from '@angular/router';
import { authGuard, adminGuard, superAdminGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Authentication routes (only accessible when not logged in)
  {
    path: 'super-admin-setup',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/super-admin-setup/super-admin-setup.page').then(m => m.SuperAdminSetupPage)
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage)
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/signup/signup.page').then(m => m.SignupPage)
  },
  {
    path: 'join',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/join/join.page').then(m => m.JoinPage)
  },

  // Protected routes (require authentication)
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      // Default redirect based on role (handled in MainLayoutComponent or redirect to activity-input)
      {
        path: '',
        redirectTo: 'activity-input',
        pathMatch: 'full'
      },
      // Member routes
      {
        path: 'activity-input',
        loadComponent: () => import('./pages/activity-input/activity-input.page').then(m => m.ActivityInputPage)
      },
      {
        path: 'activities-details',
        loadComponent: () => import('./pages/activities-details/activities-details.page').then(m => m.ActivitiesDetailsPage)
      },
      // Admin routes
      {
        path: 'management-dashboard',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/management-dashboard/management-dashboard.page').then(m => m.ManagementDashboardPage)
      },
      {
        path: 'alliance-settings',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/alliance-settings/alliance-settings.page').then(m => m.AllianceSettingsPage)
      },
      // Super Admin routes (to be created later)
      {
        path: 'super-admin',
        canActivate: [superAdminGuard],
        children: [
          {
            path: '',
            redirectTo: 'dashboard',
            pathMatch: 'full'
          },
          // TODO: Create super admin pages
          // {
          //   path: 'dashboard',
          //   loadComponent: () => import('./pages/super-admin-dashboard/super-admin-dashboard.page').then(m => m.SuperAdminDashboardPage)
          // },
          // {
          //   path: 'alliances',
          //   loadComponent: () => import('./pages/super-admin-alliances/super-admin-alliances.page').then(m => m.SuperAdminAlliancesPage)
          // },
          // {
          //   path: 'users',
          //   loadComponent: () => import('./pages/super-admin-users/super-admin-users.page').then(m => m.SuperAdminUsersPage)
          // }
        ]
      }
    ]
  },

  // Fallback route
  {
    path: '**',
    redirectTo: 'login'
  }
];
