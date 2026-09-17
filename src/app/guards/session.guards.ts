import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { QaService } from '../services/qa.service';
import { FirebaseService } from '../services/firebase.service';

function redirectToFeed(router: Router, state: RouterStateSnapshot): UrlTree {
  const segments = state.url.split('?')[0].split('/').filter(Boolean);
  const prefix = segments.slice(0, 2).join('/'); // e.g. 'session/ABC123'
  return router.parseUrl(`/${prefix}/feed`);
}

export const staffTabGuard: CanActivateFn = (_route, state) => {
  const qaService = inject(QaService);
  const router = inject(Router);
  return qaService.isStaff() ? true : redirectToFeed(router, state);
};

export const adminTabGuard: CanActivateFn = (_route, state) => {
  const qaService = inject(QaService);
  const router = inject(Router);
  return qaService.isAdmin() ? true : redirectToFeed(router, state);
};

export const organizerGuard: CanActivateFn = () => {
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);
  return firebaseService.isOrganizerLoggedIn() ? true : router.parseUrl('/auth');
};
