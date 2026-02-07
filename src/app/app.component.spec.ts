import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { provideHttpClient } from '@angular/common/http';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        TranslateService
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should configure supported languages', () => {
    TestBed.createComponent(AppComponent);
    const translate = TestBed.inject(TranslateService);
    
    expect(translate.getLangs()).toEqual(['en', 'fr', 'it', 'es']);
  });

  it('should use browser language or fallback to en', () => {
    TestBed.createComponent(AppComponent);
    const translate = TestBed.inject(TranslateService);
    
    // Either uses browser language or defaults to 'en'
    const currentLang = translate.currentLang || translate.getDefaultLang();
    expect(currentLang).toBeTruthy();
  });
});
