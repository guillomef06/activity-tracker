import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivityInputPage } from './activity-input.page';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { ActivityService } from '../../core/services/activity.service';

describe('ActivityInputPage', () => {
  let component: ActivityInputPage;
  let fixture: ComponentFixture<ActivityInputPage>;
  let activityService: ActivityService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ActivityInputPage,
        TranslateModule.forRoot()
      ],
      providers: [
        provideAnimations(),
        provideRouter([]),
        provideHttpClient(),
        ActivityService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityInputPage);
    component = fixture.componentInstance;
    activityService = TestBed.inject(ActivityService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty form fields', () => {
    expect(component.userName).toBe('');
    expect(component.activityType).toBe('');
  });

  it('should have activity types', () => {
    expect(component.activityTypes().length).toBeGreaterThan(0);
  });

  it('should update points when activity type changes', () => {
    component.activityType = 'development';
    component.onActivityTypeChange();
    expect(component.points).toBe(15);
  });

  it('should not submit if form is invalid', () => {
    const initialActivitiesCount = activityService.activitiesSignal().length;
    
    component.userName = '';
    component.activityType = '';
    component.onSubmit();
    
    expect(activityService.activitiesSignal().length).toBe(initialActivitiesCount);
  });
});
