import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SuperAdminUsersPage } from './super-admin-users.page';
import { SupabaseService } from '@app/core/services/supabase.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { provideZonelessChangeDetection } from '@angular/core';

describe('SuperAdminUsersPage', () => {
  let component: SuperAdminUsersPage;
  let fixture: ComponentFixture<SuperAdminUsersPage>;

  beforeEach(async () => {
    const mockQueryBuilder = {
      select: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      lt: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
    };
    mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.order.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.limit.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.lt.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.eq.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.update.mockReturnValue(mockQueryBuilder);

    const supabaseServiceSpy = {
      client: {
        from: vi.fn().mockReturnValue(mockQueryBuilder),
        rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      },
    };

    await TestBed.configureTestingModule({
      imports: [SuperAdminUsersPage, TranslateModule.forRoot()],
      providers: [
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperAdminUsersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have edit form with required fields', () => {
    expect(component['editForm']).toBeDefined();
    expect(component['editForm'].get('id')).toBeDefined();
    expect(component['editForm'].get('display_name')).toBeDefined();
    expect(component['editForm'].get('role')).toBeDefined();
  });

  it('should display correct columns', () => {
    expect(component['displayedColumns']).toEqual([
      'displayName',
      'username',
      'role',
      'alliance',
      'createdAt',
      'actions',
    ]);
  });

  it('should have role options', () => {
    expect(component['roles']).toEqual(['super_admin', 'admin', 'member']);
  });
});
