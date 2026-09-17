import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Header } from './components/header';
import { ShareModal } from './components/share-modal';
import { QaService } from './services/qa.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [MatIconModule, RouterOutlet, Header, ShareModal],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  public qaService = inject(QaService);

  constructor() {
    if (typeof window !== 'undefined') {
      (window as unknown as { __QA_APP__: App; qaService: QaService }).__QA_APP__ = this;
      (window as unknown as { qaService: QaService }).qaService = this.qaService;
    }
  }
}
