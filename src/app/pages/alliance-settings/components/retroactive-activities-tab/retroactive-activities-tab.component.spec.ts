import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { RetroactiveActivitiesTabComponent } from './retroactive-activities-tab.component';
import { ActivityService } from '@app/core/services';
import { AllianceService } from '@app/core/services/alliance.service';
import { TranslateModule } from '@ngx-translate/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';

describe('RetroactiveActivitiesTabComponent', () => {
  let component: RetroactiveActivitiesTabComponent;
  let fixture: ComponentFixture<RetroactiveActivitiesTabComponent>;
  let activityServiceSpy: { addActivityForMember: ReturnType<typeof vi.fn> };
  let allianceServiceSpy: {
    isActivityEnabled: ReturnType<typeof vi.fn>;
    isParticipationMode: ReturnType<typeof vi.fn>;
    getParticipationPoints: ReturnType<typeof vi.fn>;
  };
  let snackBarSpy: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    activityServiceSpy = { addActivityForMember: vi.fn() };
    allianceServiceSpy = {
      isActivityEnabled: vi.fn().mockReturnValue(true),
      isParticipationMode: vi.fn().mockReturnValue(false),
      getParticipationPoints: vi.fn().mockReturnValue(5),
    };
    snackBarSpy = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [RetroactiveActivitiesTabComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: ActivityService, useValue: activityServiceSpy },
        { provide: AllianceService, useValue: allianceServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy },
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RetroactiveActivitiesTabComponent);
    component = fixture.componentInstance;

    // Set required input
    fixture.componentRef.setInput('members', [
      { id: 'user1', display_name: 'John Doe', username: 'john' },
      { id: 'user2', display_name: 'Jane Doe', username: 'jane' },
    ]);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty form values', () => {
    expect(component['retroactiveForm'].get('member')?.value).toBe('');
    expect(component['retroactiveForm'].get('week')?.value).toBe(0);
    expect(component['retroactiveForm'].get('activity')?.value).toBe('');
    expect(component['retroactiveForm'].get('position')?.value).toBe(1);
  });

  it('should generate 6 week options (current + 5 past weeks)', () => {
    const weekOptions = component.weekOptions();
    expect(weekOptions.length).toBe(6);
    expect(weekOptions[0].value).toBe(0); // Current week
    expect(weekOptions[5].value).toBe(5); // 5 weeks ago
  });

  it('should filter activities based on selected week cycle', () => {
    component['retroactiveForm'].patchValue({ week: 0 });

    const activities = component.availableActivities();
    expect(activities.length).toBeGreaterThan(0);
    expect(activities.every(a => a.availableWeeks)).toBeTruthy();
  });

  it('should exclude disabled activities from availableActivities', () => {
    allianceServiceSpy.isActivityEnabled.mockReturnValue(false);
    // Use week: 1 (different from initial 0) to force the computed signal to re-evaluate
    component['retroactiveForm'].patchValue({ week: 1 });

    const activities = component.availableActivities();
    expect(activities.length).toBe(0);
  });

  it('should calculate points correctly', () => {
    component['retroactiveForm'].patchValue({ activity: 'golden expedition', position: 1 });

    const points = component.calculatedPoints();
    expect(points).toBe(5); // Golden expedition base points
  });

  it('should disable submit when required fields are empty', () => {
    component['retroactiveForm'].patchValue({ member: '', activity: '' });

    expect(component.canSubmit()).toBe(false);
  });

  it('should show success message after successful submission', async () => {
    activityServiceSpy.addActivityForMember.mockResolvedValue({ error: null });

    component['retroactiveForm'].patchValue({ member: 'user1', activity: 'legion', position: 3 });

    await component.onSubmit();

    expect(snackBarSpy.open).toHaveBeenCalled();
  });

  it('should reset activity and position after successful submission', async () => {
    activityServiceSpy.addActivityForMember.mockResolvedValue({ error: null });

    component['retroactiveForm'].patchValue({ member: 'user1', activity: 'legion', position: 3 });

    await component.onSubmit();

    expect(component['retroactiveForm'].get('activity')?.value).toBe('');
    expect(component['retroactiveForm'].get('position')?.value).toBe(1);
  });

  it('should reset all form fields when resetForm is called', () => {
    component['retroactiveForm'].patchValue({
      member: 'user1',
      activity: 'legion',
      position: 5,
      week: 2,
    });

    component.resetForm();

    expect(component['retroactiveForm'].get('member')?.value).toBe('');
    expect(component['retroactiveForm'].get('activity')?.value).toBe('');
    expect(component['retroactiveForm'].get('position')?.value).toBe(1);
    expect(component['retroactiveForm'].get('week')?.value).toBe(0);
  });
});
