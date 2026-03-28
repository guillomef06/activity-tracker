import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SuperAdminAlliancesPage } from './super-admin-alliances.page';
import { SupabaseService } from '@app/core/services/supabase.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { provideZonelessChangeDetection } from '@angular/core';

describe('SuperAdminAlliancesPage', () => {
  let component: SuperAdminAlliancesPage;
  let fixture: ComponentFixture<SuperAdminAlliancesPage>;

  beforeEach(async () => {
    // Create a chainable mock for Supabase client
    interface MockQueryBuilder {
      select: ReturnType<typeof vi.fn>;
      order: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
      single: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      then: (resolve: (value: { data: unknown[]; count: number; error: null }) => void) => void;
    }

    const mockQueryBuilder = {} as MockQueryBuilder;
    mockQueryBuilder.select = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.order = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.eq = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.limit = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.single = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.update = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.delete = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.then = resolve => {
      resolve({ data: [], count: 0, error: null });
    };

    const supabaseServiceSpy = {
      client: {
        from: vi.fn().mockReturnValue(mockQueryBuilder),
      },
    };

    await TestBed.configureTestingModule({
      imports: [SuperAdminAlliancesPage, TranslateModule.forRoot()],
      providers: [
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperAdminAlliancesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have edit form', () => {
    expect(component['editForm']).toBeDefined();
    expect(component['editForm'].get('id')).toBeDefined();
    expect(component['editForm'].get('name')).toBeDefined();
  });

  it('should display correct columns', () => {
    expect(component['displayedColumns']).toEqual(['name', 'tag', 'admin', 'members', 'createdAt', 'actions']);
  });
});
