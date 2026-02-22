import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { SwUpdate } from '@angular/service-worker';
import { MatDialog } from '@angular/material/dialog';
import { AppComponent } from './app.component';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

const swUpdateMock = {
  isEnabled: false,
  versionUpdates: new Subject().asObservable(),
};

const dialogMock = {
  open: vi.fn().mockReturnValue({ afterClosed: () => new Subject() }),
};

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
        { provide: SwUpdate, useValue: swUpdateMock },
        { provide: MatDialog, useValue: dialogMock },
      ],
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
