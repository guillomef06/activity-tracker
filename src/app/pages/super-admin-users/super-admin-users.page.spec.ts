import { ComponentFixture, TestBed } from '@angular/core/testing';
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
    const supabaseServiceSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue(
              Promise.resolve({ data: [], error: null })
            ),
          }),
          update: jasmine.createSpy('update').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue(
              Promise.resolve({ error: null })
            ),
          }),
        }),
        auth: {
          admin: {
            deleteUser: jasmine.createSpy('deleteUser').and.returnValue(
              Promise.resolve({ error: null })
            ),
          },
        },
      },
    });

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
