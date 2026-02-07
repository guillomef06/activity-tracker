import { TestBed } from '@angular/core/testing';
import { ActivityService } from './activity.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('ActivityService', () => {
  let service: ActivityService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ActivityService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ActivityService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial empty activities', () => {
    expect(service.activitiesSignal()).toEqual([]);
  });

  it('should calculate user scores', () => {
    const scores = service.getUserScores();
    expect(Array.isArray(scores)).toBe(true);
  });

  it('should add activity to the list', () => {
    const activity = {
      userId: 'test-user',
      userName: 'Test User',
      activityType: 'development',
      points: 15,
      date: new Date()
    };

    service.addActivity(activity);
    
    const activities = service.activitiesSignal();
    expect(activities.length).toBe(1);
    expect(activities[0]).toEqual(jasmine.objectContaining({
      userId: 'test-user',
      userName: 'Test User',
      activityType: 'development',
      points: 15
    }));
  });
});
