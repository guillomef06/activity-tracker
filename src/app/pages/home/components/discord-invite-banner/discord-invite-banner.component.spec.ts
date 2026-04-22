import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { DiscordInviteBannerComponent } from './discord-invite-banner.component';

const DISMISSED_STORAGE_KEY = 'discord_invite_banner_dismissed';

describe('DiscordInviteBannerComponent', () => {
  let component: DiscordInviteBannerComponent;
  let fixture: ComponentFixture<DiscordInviteBannerComponent>;

  beforeEach(async () => {
    localStorage.removeItem(DISMISSED_STORAGE_KEY);

    await TestBed.configureTestingModule({
      imports: [DiscordInviteBannerComponent, TranslateModule.forRoot()],
      providers: [provideZonelessChangeDetection(), provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(DiscordInviteBannerComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.removeItem(DISMISSED_STORAGE_KEY);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not render the banner when inviteUrl is null', () => {
    fixture.componentRef.setInput('inviteUrl', null);
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.discord-banner');
    expect(banner).toBeNull();
  });

  it('should not render the banner when already dismissed via localStorage', () => {
    localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');

    // Recreate component so it reads localStorage on init
    fixture = TestBed.createComponent(DiscordInviteBannerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('inviteUrl', 'https://discord.gg/abc123');
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.discord-banner');
    expect(banner).toBeNull();
  });

  it('should render the banner when inviteUrl is set and not dismissed', () => {
    fixture.componentRef.setInput('inviteUrl', 'https://discord.gg/abc123');
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.discord-banner');
    expect(banner).not.toBeNull();
  });

  it('should persist dismissal to localStorage when dismiss() is called', () => {
    fixture.componentRef.setInput('inviteUrl', 'https://discord.gg/abc123');
    fixture.detectChanges();

    component['dismiss']();

    expect(localStorage.getItem(DISMISSED_STORAGE_KEY)).toBe('true');
  });

  it('should render the invite link with correct href and target', () => {
    const url = 'https://discord.gg/abc123';
    fixture.componentRef.setInput('inviteUrl', url);
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[mat-flat-button]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
