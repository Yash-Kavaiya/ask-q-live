import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'session/:code/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'series/:code/**',
    renderMode: RenderMode.Client,
  },
  {
    // organizerGuard depends on live Firebase auth state, which does not exist
    // at build time. Prerendering /host would bake the guard's unauthenticated
    // redirect to /auth into the shipped HTML as a permanent meta refresh.
    path: 'host',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
