import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SuperAdminDashboardPage } from './super-admin-dashboard.page';
import { SupabaseService } from '@app/core/services/supabase.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { provideZonelessChangeDetection } from '@angular/core';

describe('SuperAdminDashboardPage', () => {
  let component: SuperAdminDashboardPage;
  let fixture: ComponentFixture<SuperAdminDashboardPage>;

  beforeEach(async () => {
    // Create a chainable mock for Supabase client
    interface MockQueryBuilder {
      select: ReturnType<typeof vi.fn>;
      is: ReturnType<typeof vi.fn>;
      gt: ReturnType<typeof vi.fn>;
      then: (resolve: (value: { data: null; count: number; error: null }) => void) => void;
    }

    const mockQueryBuilder = {} as MockQueryBuilder;
    mockQueryBuilder.select = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.is = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.gt = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.then = resolve => {
      resolve({ data: null, count: 0, error: null });
    };

    const supabaseServiceSpy = {
      client: {
        from: vi.fn().mockReturnValue(mockQueryBuilder),
      },
    };

    await TestBed.configureTestingModule({
      imports: [SuperAdminDashboardPage, TranslateModule.forRoot()],
      providers: [
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperAdminDashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have statistics signals', () => {
    expect(component['stats']).toBeDefined();
  });
});
