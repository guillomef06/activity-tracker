import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { BackToDashboardButtonComponent } from './back-to-dashboard-button.component';

describe('BackToDashboardButtonComponent', () => {
  let fixture: ComponentFixture<BackToDashboardButtonComponent>;
  let link: HTMLAnchorElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BackToDashboardButtonComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(BackToDashboardButtonComponent);
    fixture.detectChanges();
    link = fixture.nativeElement.querySelector('a');
  });

  it('renders a single link to the super-admin dashboard', () => {
    expect(fixture.nativeElement.querySelectorAll('a').length).toBe(1);
    expect(link.getAttribute('href')).toBe('/app/super-admin/dashboard');
  });

  it('shows the arrow_back icon', () => {
    expect(link.querySelector('mat-icon')?.textContent?.trim()).toBe('arrow_back');
  });

  it('exposes a translated accessible name', () => {
    expect(link.getAttribute('aria-label')).toBe('superAdmin.backToDashboard');
  });

  it('is a Material icon button', () => {
    expect(link.hasAttribute('mat-icon-button')).toBe(true);
  });
});
