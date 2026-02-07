import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>'
})
export class AppComponent {
  private translate = inject(TranslateService);

  constructor() {
    // Configure supported languages
    const supportedLanguages = ['en', 'fr', 'it', 'es'];
    this.translate.addLangs(supportedLanguages);

    // Get browser language and use it if supported
    const browserLang = this.translate.getBrowserLang();
    const langToUse = browserLang && supportedLanguages.includes(browserLang) 
      ? browserLang 
      : 'en';
    
    this.translate.use(langToUse);
  }
}
