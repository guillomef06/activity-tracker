import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { vi } from 'vitest';
import { MightiestGovernorComponent } from './mightiest-governor.component';
import { MgEventService } from '@app/core/services/mg-event.service';
import { AuthService } from '@app/core/services/auth.service';
import { SnackbarService } from '@app/core/services';

const mockMgEventService = {
  loadCurrentEvent: vi.fn().mockResolvedValue(null),
  loadUserRegistration: vi.fn().mockResolvedValue(null),
  loadSelection: vi.fn().mockResolvedValue([]),
  registerPlayer: vi.fn().mockResolvedValue({ error: null }),
  unregisterPlayer: vi.fn().mockResolvedValue({ error: null }),
};

const mockAuthService = {
  getServerId: vi.fn().mockReturnValue('server-1'),
  getUserId: vi.fn().mockReturnValue('user-1'),
};

const mockSnackbarService = {
  success: vi.fn(),
  error: vi.fn(),
};

describe('MightiestGovernorComponent', () => {
  let component: MightiestGovernorComponent;
  let fixture: ComponentFixture<MightiestGovernorComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [MightiestGovernorComponent, TranslateModule.forRoot()],
      providers: [
        provideAnimations(),
        provideZonelessChangeDetection(),
        { provide: MgEventService, useValue: mockMgEventService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: SnackbarService, useValue: mockSnackbarService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MightiestGovernorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 10 slots', () => {
    expect(component.slots.length).toBe(10);
  });

  it('should have rank 1 cost 150 and medal 100', () => {
    expect(component.slots[0].cost).toBe(150);
    expect(component.slots[0].medal).toBe(100);
    expect(component.slots[0].rankLabel).toBe('1');
  });

  it('should have last slot cover rank 26-50 with cost 60', () => {
    expect(component.slots[9].rankLabel).toBe('26-50');
    expect(component.slots[9].cost).toBe(60);
    expect(component.slots[9].medal).toBe(5);
  });

  it('should build targetLabel as single value for individual ranks', () => {
    expect(component.slots[0].targetLabel).toBe('30M');
    expect(component.slots[4].targetLabel).toBe('26M');
  });

  it('should build targetLabel as range for grouped ranks', () => {
    expect(component.slots[5].targetLabel).toBe('24M-26M');
    expect(component.slots[9].targetLabel).toBe('10M-15M');
  });

  it('costs should be non-increasing', () => {
    for (let i = 0; i < component.slots.length - 1; i++) {
      expect(component.slots[i].cost).toBeGreaterThanOrEqual(component.slots[i + 1].cost);
    }
  });

  it('should call loadCurrentEvent on init', () => {
    expect(mockMgEventService.loadCurrentEvent).toHaveBeenCalledWith('server-1');
  });

  it('should not show event card when no event loaded', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-mg-event-card')).toBeNull();
  });
});
