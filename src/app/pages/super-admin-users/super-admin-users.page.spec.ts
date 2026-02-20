import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SuperAdminUsersPage } from './super-admin-users.page';
import { SupabaseService } from '@app/core/services/supabase.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

describe('SuperAdminUsersPage', () => {
  let component: SuperAdminUsersPage;
  let fixture: ComponentFixture<SuperAdminUsersPage>;

  beforeEach(async () => {
    const supabaseServiceSpy = {
      client: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue(
              Promise.resolve({ data: [], error: null })
            ),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(
              Promise.resolve({ error: null })
            ),
          }),
        }),
        auth: {
          admin: {
            deleteUser: vi.fn().mockReturnValue(
              Promise.resolve({ error: null })
            ),
          },
        },
      },
    };

    await TestBed.configureTestingModule({
      imports: [SuperAdminUsersPage, TranslateModule.forRoot()],
      providers: [
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
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
