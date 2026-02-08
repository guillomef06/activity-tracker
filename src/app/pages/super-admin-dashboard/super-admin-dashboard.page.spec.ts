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
  let supabaseService: jasmine.SpyObj<SupabaseService>;

  beforeEach(async () => {
    const supabaseServiceSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            count: jasmine.createSpy('count').and.returnValue(
              Promise.resolve({ data: null, count: 0, error: null })
            ),
          }),
        }),
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
    supabaseService = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have statistics signals', () => {
    expect(component['stats']).toBeDefined();
    expect(component['isLoading']).toBeDefined();
  });
});
