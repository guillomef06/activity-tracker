import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Auth Guard - Protects routes that require authentication
 * Redirects to login page if user is not authenticated
 */
export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth initialization if still loading
  while (authService.isLoading()) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (authService.isAuthenticated()) {
    return true;
  }

  // Redirect to login with return URL
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url }
  });
};

/**
 * Admin Guard - Protects routes that require admin role
 * Redirects to home if user is not an admin
 */
export const adminGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth initialization if still loading
  while (authService.isLoading()) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url }
    });
  }

  if (authService.isAdmin()) {
    return true;
  }

  // Redirect to home if not admin
  return router.createUrlTree(['/activity-input']);
};

/**
 * Guest Guard - Redirects authenticated users away from auth pages
 * Use this for login/signup pages
 */
export const guestGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth initialization if still loading
  while (authService.isLoading()) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!authService.isAuthenticated()) {
    return true;
  }

  // Redirect authenticated users to home
  return router.createUrlTree(['/activity-input']);
};
