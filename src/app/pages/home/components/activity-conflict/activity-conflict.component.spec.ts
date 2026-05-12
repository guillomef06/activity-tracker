import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivityConflictComponent } from './activity-conflict.component';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { PositionConflict } from '@shared/models';
import { vi } from 'vitest';

const MOCK_CONFLICTS: PositionConflict[] = [
  {
    activityId: 'act-1',
    activityType: 'kvk prep',
    position: 3,
    date: new Date('2026-05-05'),
    conflictingDisplayName: 'PlayerTwo',
  },
  {
    activityId: 'act-2',
    activityType: 'kvk cross border',
    position: 1,
    date: new Date('2026-05-05'),
    conflictingDisplayName: 'PlayerThree',
  },
];

describe('ActivityConflictComponent', () => {
  let component: ActivityConflictComponent;
  let fixture: ComponentFixture<ActivityConflictComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityConflictComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityConflictComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('conflicts', MOCK_CONFLICTS);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render one list item per conflict', () => {
    const items = fixture.nativeElement.querySelectorAll('.conflict-item');
    expect(items.length).toBe(2);
  });

  it('should emit acknowledged when the acknowledge button is clicked', () => {
    const acknowledgedSpy = vi.fn();
    component.acknowledged.subscribe(acknowledgedSpy);

    const button = fixture.nativeElement.querySelector('.acknowledge-button');
    button.click();

    expect(acknowledgedSpy).toHaveBeenCalledTimes(1);
  });

  it('should render no items when conflicts list is empty', () => {
    fixture.componentRef.setInput('conflicts', []);
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.conflict-item');
    expect(items.length).toBe(0);
  });
});
