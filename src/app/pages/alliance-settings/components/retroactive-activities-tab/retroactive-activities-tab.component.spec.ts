import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RetroactiveActivitiesTabComponent } from './retroactive-activities-tab.component';
import { ActivityService } from '@app/core/services';
import { TranslateModule } from '@ngx-translate/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('RetroactiveActivitiesTabComponent', () => {
  let component: RetroactiveActivitiesTabComponent;
  let fixture: ComponentFixture<RetroactiveActivitiesTabComponent>;
  let activityServiceSpy: jasmine.SpyObj<ActivityService>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  beforeEach(async () => {
    activityServiceSpy = jasmine.createSpyObj('ActivityService', ['addActivityForMember']);
    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        RetroactiveActivitiesTabComponent,
        TranslateModule.forRoot(),
        NoopAnimationsModule
      ],
      providers: [
        { provide: ActivityService, useValue: activityServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RetroactiveActivitiesTabComponent);
    component = fixture.componentInstance;
    
    // Set required input
    fixture.componentRef.setInput('members', [
      { id: 'user1', display_name: 'John Doe', username: 'john' },
      { id: 'user2', display_name: 'Jane Doe', username: 'jane' }
    ]);
    
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty form values', () => {
    expect(component.selectedMember()).toBe('');
    expect(component.selectedWeeksAgo()).toBe(0);
    expect(component.selectedActivity()).toBe('');
    expect(component.position()).toBe(1);
  });

  it('should generate 6 week options (current + 5 past weeks)', () => {
    const weekOptions = component.weekOptions();
    expect(weekOptions.length).toBe(6);
    expect(weekOptions[0].value).toBe(0); // Current week
    expect(weekOptions[5].value).toBe(5); // 5 weeks ago
  });

  it('should filter activities based on selected week cycle', () => {
    // Set to week that should have specific activities
    component.selectedWeeksAgo.set(0);
    
    const activities = component.availableActivities();
    expect(activities.length).toBeGreaterThan(0);
    expect(activities.every(a => a.availableWeeks)).toBeTruthy();
  });

  it('should calculate points correctly', () => {
    component.selectedActivity.set('golden expedition');
    component.position.set(1);
    
    const points = component.calculatedPoints();
    expect(points).toBe(5); // Golden expedition base points
  });

  it('should disable submit when required fields are empty', () => {
    component.selectedMember.set('');
    component.selectedActivity.set('');
    
    expect(component.canSubmit()).toBe(false);
  });

  it('should enable submit when all required fields are filled', () => {
    component.selectedMember.set('user1');
    component.selectedActivity.set('legion');
    component.position.set(5);
    
    expect(component.canSubmit()).toBe(true);
  });

  it('should call activityService.addActivityForMember on submit', async () => {
    activityServiceSpy.addActivityForMember.and.returnValue(Promise.resolve({ error: null }));
    
    component.selectedMember.set('user1');
    component.selectedActivity.set('legion');
    component.position.set(3);
    component.selectedWeeksAgo.set(0);

    await component.onSubmit();

    expect(activityServiceSpy.addActivityForMember).toHaveBeenCalledWith(
      'user1',
      jasmine.objectContaining({
        activityType: 'legion',
        position: 3
      })
    );
  });

  it('should show success message after successful submission', async () => {
    activityServiceSpy.addActivityForMember.and.returnValue(Promise.resolve({ error: null }));
    
    component.selectedMember.set('user1');
    component.selectedActivity.set('legion');
    component.position.set(3);

    await component.onSubmit();

    expect(snackBarSpy.open).toHaveBeenCalled();
  });

  it('should reset activity and position after successful submission', async () => {
    activityServiceSpy.addActivityForMember.and.returnValue(Promise.resolve({ error: null }));
    
    component.selectedMember.set('user1');
    component.selectedActivity.set('legion');
    component.position.set(3);

    await component.onSubmit();

    expect(component.selectedActivity()).toBe('');
    expect(component.position()).toBe(1);
  });

  it('should reset all form fields when resetForm is called', () => {
    component.selectedMember.set('user1');
    component.selectedActivity.set('legion');
    component.position.set(5);
    component.selectedWeeksAgo.set(2);

    component.resetForm();

    expect(component.selectedMember()).toBe('');
    expect(component.selectedActivity()).toBe('');
    expect(component.position()).toBe(1);
    expect(component.selectedWeeksAgo()).toBe(0);
  });
});
