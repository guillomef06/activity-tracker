import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SuperAdminUsersPage } from './super-admin-users.page';
import { SupabaseService } from '@app/core/services/supabase.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
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
        provideHttpClient(withXhr()),
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

  it('should have an edit form with display_name and role fields', () => {
    expect(component['editForm']).toBeDefined();
    expect(component['editForm'].display_name).toBeDefined();
    expect(component['editForm'].role).toBeDefined();
  });

  it('should be invalid when display_name and role are empty', () => {
    expect(component['editForm']().valid()).toBe(false);
  });

  it('should become valid once display_name and role are filled', () => {
    component['editModel'].set({ display_name: 'Jane Doe', role: 'member' });

    expect(component['editForm']().valid()).toBe(true);
  });

  it('should require display_name to be at least 2 characters', () => {
    component['editModel'].set({ display_name: 'J', role: 'member' });

    expect(
      component['editForm']
        .display_name()
        .errors()
        .some(error => error.kind === 'minLength')
    ).toBe(true);
  });

  it('should require a role', () => {
    component['editModel'].set({ display_name: 'Jane Doe', role: '' });

    expect(
      component['editForm']
        .role()
        .errors()
        .some(error => error.kind === 'required')
    ).toBe(true);
  });

  it('should display correct columns', () => {
    expect(component['displayedColumns']).toEqual([
      'displayName',
      'username',
      'role',
      'server',
      'createdAt',
      'actions',
    ]);
  });

  it('should have role options', () => {
    expect(component['roles']).toEqual(['super_admin', 'admin', 'member']);
  });
});
