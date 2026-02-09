import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ManagementDashboardPage } from './management-dashboard.page';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { ActivityService } from '../../core/services/activity.service';

describe('ManagementDashboardPage', () => {
  let component: ManagementDashboardPage;
  let fixture: ComponentFixture<ManagementDashboardPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ManagementDashboardPage,
        TranslateModule.forRoot()
      ],
      providers: [
        provideAnimations(),
        provideRouter([]),
        provideHttpClient(),
        ActivityService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ManagementDashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with loading state', () => {
    expect(component.loading()).toBeDefined();
  });

  it('should have hasData signal', () => {
    expect(component.hasData()).toBeDefined();
    expect(typeof component.hasData()).toBe('boolean');
  });

  it('should navigate to activities details page', () => {
    const navigateSpy = spyOn(component['router'], 'navigate');
    
    component.viewAllDetails();
    
    expect(navigateSpy).toHaveBeenCalledWith(['/activities-details']);
  });
});
