import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { QaService } from '../services/qa.service';
import { FirebaseService } from '../services/firebase.service';

function redirectToFeed(router: Router, state: RouterStateSnapshot): UrlTree {
  const segments = state.url.split('?')[0].split('/').filter(Boolean);
  const prefix = segments.slice(0, 2).join('/'); // e.g. 'session/ABC123'
  return router.parseUrl(`/${prefix}/feed`);
}

// Loads/authenticates the session for every child route under session/:code
// and series/:code. This MUST be a canActivateChild guard on the parent
// route rather than a resolve() — Angular's router runs *all* canActivate
// guards for the whole matched tree (including staffTabGuard/adminTabGuard
// on the child routes below) before *any* resolver runs. A resolve() here
// would race a cold deep link: staffTabGuard would read qaService.isStaff()
// before this guard ever got a chance to authenticate the role, bouncing
// hosts/staff back to /feed. canActivateChild guards on a parent are always
// awaited before a child's own canActivate runs, so this ordering is safe.
export const sessionGuard: CanActivateChildFn = async (childRoute, _state) => {
  const qaService = inject(QaService);
  const router = inject(Router);
  const code = (
    childRoute.paramMap.get('code') ||
    childRoute.parent?.paramMap.get('code') ||
    ''
  ).toUpperCase();

  if (!code) {
    return router.parseUrl('/');
  }

  const alreadyLoaded =
    qaService.currentSession()?.joinCode === code || qaService.currentSeries()?.joinCode === code;
  if (alreadyLoaded) {
    return true;
  }

  const success = await qaService.joinSession(code);
  return success ? true : router.parseUrl('/');
};

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
