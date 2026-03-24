import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivitiesDetailsComponent } from './activities-details.component';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UserScore } from '@shared/models/activity.model';
import { provideZonelessChangeDetection } from '@angular/core';

const mockUserScores: UserScore[] = [
  {
    userId: 'u1',
    userName: 'Alice',
    sixWeekTotal: 120,
    weeklyScores: [
      {
        weekStart: new Date('2024-01-01'),
        weekEnd: new Date('2024-01-07'),
        totalPoints: 30,
        activities: [
          {
            id: 'a1',
            userId: 'u1',
            userName: 'Alice',
            activityType: 'kvk-prep',
            position: 1,
            points: 30,
            date: new Date('2024-01-03'),
            timestamp: 1704240000000,
          },
        ],
      },
    ],
  },
];

describe('ActivitiesDetailsComponent', () => {
  let component: ActivitiesDetailsComponent;
  let fixture: ComponentFixture<ActivitiesDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivitiesDetailsComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivitiesDetailsComponent);
    fixture.componentRef.setInput('userScores', mockUserScores);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display user scores', () => {
    expect(component.userScores()).toEqual(mockUserScores);
  });

  it('should toggle user details on click', () => {
    expect(component['selectedUserId']()).toBeNull();
    component['toggleUserDetails']('u1');
    expect(component['selectedUserId']()).toBe('u1');
    component['toggleUserDetails']('u1');
    expect(component['selectedUserId']()).toBeNull();
  });
});
