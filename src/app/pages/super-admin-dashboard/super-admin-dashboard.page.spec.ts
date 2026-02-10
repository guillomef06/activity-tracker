import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SuperAdminDashboardPage } from './super-admin-dashboard.page';
import { SupabaseService } from '@app/core/services/supabase.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

describe('SuperAdminDashboardPage', () => {
  let component: SuperAdminDashboardPage;
  let fixture: ComponentFixture<SuperAdminDashboardPage>;

  beforeEach(async () => {
    // Create a chainable mock for Supabase client
    interface MockQueryBuilder {
      select: jasmine.Spy;
      is: jasmine.Spy;
      gt: jasmine.Spy;
      then: (resolve: (value: { data: null; count: number; error: null }) => void) => void;
    }
    
    const mockQueryBuilder = {} as MockQueryBuilder;
    mockQueryBuilder.select = jasmine.createSpy('select').and.returnValue(mockQueryBuilder);
    mockQueryBuilder.is = jasmine.createSpy('is').and.returnValue(mockQueryBuilder);
    mockQueryBuilder.gt = jasmine.createSpy('gt').and.returnValue(mockQueryBuilder);
    mockQueryBuilder.then = (resolve) => { resolve({ data: null, count: 0, error: null }); };

    const supabaseServiceSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from').and.returnValue(mockQueryBuilder),
      },
    });

    await TestBed.configureTestingModule({
      imports: [SuperAdminDashboardPage, TranslateModule.forRoot()],
      providers: [
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
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
