import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SuperAdminAlliancesPage } from './super-admin-alliances.page';
import { SupabaseService } from '@app/core/services/supabase.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

describe('SuperAdminAlliancesPage', () => {
  let component: SuperAdminAlliancesPage;
  let fixture: ComponentFixture<SuperAdminAlliancesPage>;
  let supabaseService: jasmine.SpyObj<SupabaseService>;

  beforeEach(async () => {
    const supabaseServiceSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue(
            Promise.resolve({ data: [], error: null })
          ),
          update: jasmine.createSpy('update').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue(
              Promise.resolve({ error: null })
            ),
          }),
          delete: jasmine.createSpy('delete').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue(
              Promise.resolve({ error: null })
            ),
          }),
        }),
      },
    });

    await TestBed.configureTestingModule({
      imports: [SuperAdminAlliancesPage, TranslateModule.forRoot()],
      providers: [
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperAdminAlliancesPage);
    component = fixture.componentInstance;
    supabaseService = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
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
    expect(component['displayedColumns']).toEqual([
      'name',
      'admin',
      'members',
      'createdAt',
      'actions',
    ]);
  });
});
