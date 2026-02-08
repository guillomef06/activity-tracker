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

  beforeEach(async () => {
    // Create a chainable mock for Supabase client
    interface MockQueryBuilder {
      select: jasmine.Spy;
      order: jasmine.Spy;
      eq: jasmine.Spy;
      limit: jasmine.Spy;
      single: jasmine.Spy;
      update: jasmine.Spy;
      delete: jasmine.Spy;
      then: (resolve: (value: { data: unknown[]; count: number; error: null }) => void) => void;
    }
    
    const mockQueryBuilder = {} as MockQueryBuilder;
    mockQueryBuilder.select = jasmine.createSpy('select').and.returnValue(mockQueryBuilder);
    mockQueryBuilder.order = jasmine.createSpy('order').and.returnValue(mockQueryBuilder);
    mockQueryBuilder.eq = jasmine.createSpy('eq').and.returnValue(mockQueryBuilder);
    mockQueryBuilder.limit = jasmine.createSpy('limit').and.returnValue(mockQueryBuilder);
    mockQueryBuilder.single = jasmine.createSpy('single').and.returnValue(mockQueryBuilder);
    mockQueryBuilder.update = jasmine.createSpy('update').and.returnValue(mockQueryBuilder);
    mockQueryBuilder.delete = jasmine.createSpy('delete').and.returnValue(mockQueryBuilder);
    mockQueryBuilder.then = (resolve) => { resolve({ data: [], count: 0, error: null }); };

    const supabaseServiceSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from').and.returnValue(mockQueryBuilder),
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
