import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Header } from './components/header';
import { SessionJoin } from './components/session-join';
import { AuthPage } from './components/auth-page';
import { HostStudio } from './components/host-studio';
import { QuestionFeed } from './components/question-feed';
import { WordCloudAnalytics } from './components/word-cloud-analytics';
import { Teleprompter } from './components/teleprompter';
import { ModerationQueue } from './components/moderation-queue';
import { GroundingContext } from './components/grounding-context';
import { ExecutiveReport } from './components/executive-report';
import { SeriesControlRoom } from './components/series-control-room';
import { SeriesLobby } from './components/series-lobby';
import { ShareModal } from './components/share-modal';
import { QaService } from './services/qa.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [
    MatIconModule,
    Header,
    SessionJoin,
    AuthPage,
    HostStudio,
    QuestionFeed,
    WordCloudAnalytics,
    Teleprompter,
    ModerationQueue,
    GroundingContext,
    ExecutiveReport,
    SeriesControlRoom,
    SeriesLobby,
    ShareModal,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  public qaService = inject(QaService);
}

