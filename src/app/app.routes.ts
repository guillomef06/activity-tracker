import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./core/layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/activity-input/activity-input.page').then(m => m.ActivityInputPage)
      },
      {
        path: 'management',
        loadComponent: () => import('./pages/management-dashboard/management-dashboard.page').then(m => m.ManagementDashboardPage)
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
