import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, ResolveFn, Router, UrlTree } from '@angular/router';
import { QaService } from '../services/qa.service';

export const sessionResolver: ResolveFn<boolean | UrlTree> = async (route: ActivatedRouteSnapshot) => {
  const qaService = inject(QaService);
  const router = inject(Router);
  const code = (route.paramMap.get('code') || '').toUpperCase();

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
