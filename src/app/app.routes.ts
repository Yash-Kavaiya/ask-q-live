import { Routes } from '@angular/router';
import { SessionJoin } from './components/session-join';
import { AuthPage } from './components/auth-page';
import { HostStudio } from './components/host-studio';
import { QuestionFeed } from './components/question-feed';
import { SeriesControlRoom } from './components/series-control-room';
import { Teleprompter } from './components/teleprompter';
import { WordCloudAnalytics } from './components/word-cloud-analytics';
import { ModerationQueue } from './components/moderation-queue';
import { GroundingContext } from './components/grounding-context';
import { ExecutiveReport } from './components/executive-report';
import { sessionResolver } from './resolvers/session.resolver';
import { staffTabGuard, adminTabGuard, organizerGuard } from './guards/session.guards';

const sessionChildRoutes: Routes = [
  { path: '', redirectTo: 'feed', pathMatch: 'full' },
  { path: 'feed', component: QuestionFeed },
  { path: 'run-of-show', component: SeriesControlRoom, canActivate: [staffTabGuard] },
  { path: 'teleprompter', component: Teleprompter, canActivate: [staffTabGuard] },
  { path: 'analytics', component: WordCloudAnalytics, canActivate: [staffTabGuard] },
  { path: 'moderation', component: ModerationQueue, canActivate: [adminTabGuard] },
  { path: 'grounding', component: GroundingContext, canActivate: [adminTabGuard] },
  { path: 'report', component: ExecutiveReport, canActivate: [staffTabGuard] },
];

export const routes: Routes = [
  { path: '', component: SessionJoin },
  { path: 'auth', component: AuthPage },
  { path: 'host', component: HostStudio, canActivate: [organizerGuard] },
  { path: 'session/:code', resolve: { sessionLoaded: sessionResolver }, children: sessionChildRoutes },
  { path: 'series/:code', resolve: { sessionLoaded: sessionResolver }, children: sessionChildRoutes },
  { path: '**', redirectTo: '' },
];
