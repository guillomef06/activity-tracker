import { TestBed } from '@angular/core/testing';
import { ActivityService } from './activity.service';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { SupabaseService } from './supabase.service';
import { PointRulesService } from './point-rules.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';

describe('ActivityService', () => {
  let service: ActivityService;

  beforeEach(() => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['getUserId', 'isAuthenticated'], {
      userProfile: signal({ id: 'test-user', display_name: 'Test User' }),
    });
    
    const storageServiceSpy = jasmine.createSpyObj('StorageService', ['get', 'set', 'remove']);
    const supabaseServiceSpy = jasmine.createSpyObj('SupabaseService', ['from']);
    const pointRulesServiceSpy = jasmine.createSpyObj('PointRulesService', ['calculatePoints', 'loadRules']);
    
    authServiceSpy.isAuthenticated.and.returnValue(false);
    authServiceSpy.getUserId.and.returnValue('test-user');
    storageServiceSpy.get.and.returnValue([]);
    pointRulesServiceSpy.calculatePoints.and.returnValue({ points: 15, source: 'default' });
    pointRulesServiceSpy.loadRules.and.returnValue(Promise.resolve());

    TestBed.configureTestingModule({
      providers: [
        ActivityService,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: StorageService, useValue: storageServiceSpy },
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        { provide: PointRulesService, useValue: pointRulesServiceSpy },
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

  it('should add activity to the list', async () => {
    const activity = {
      activityType: 'development',
      position: 1,
      date: new Date()
    };

    await service.addActivity(activity);
    
    const activities = service.activitiesSignal();
    expect(activities.length).toBe(1);
    expect(activities[0]).toEqual(jasmine.objectContaining({
      userId: 'test-user',
      userName: 'Test User',
      activityType: 'development',
      position: 1,
      points: 15
    }));
  });
});
