import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Activity, ActivityRequest, UserScore, WeeklyScore } from '../../shared/models';
import { firstValueFrom } from 'rxjs';
import { StorageService } from './storage.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { PointRulesService } from './point-rules.service';
import { APP_CONSTANTS } from '../../shared/constants/constants';
import { generateId } from '../../shared/utils/id-generator.util';
import { environment } from '../../../environments/environment';

interface MockData {
  users: { id: string; name: string; email: string }[];
  activities: {
    userId: string;
    userName: string;
    activityType: string;
    points: number;
    weeksAgo: number;
    daysAgo: number;
  }[];
}

interface SupabaseActivity {
  id: string;
  user_id: string;
  activity_type: string;
  position: number;
  points: number;
  date: string;
  user_profiles: {
    display_name: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ActivityService {
  private http = inject(HttpClient);
  private storage = inject(StorageService);
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);
  private pointRulesService = inject(PointRulesService);
  
  private activities = signal<Activity[]>([]);
  private isInitialized = false;
  
  readonly activitiesSignal = this.activities.asReadonly();
  
  private get useSupabase(): boolean {
    return !environment.enableMockData && this.authService.isAuthenticated();
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.useSupabase) {
      await this.pointRulesService.loadRules();
      await this.loadFromSupabase();
    } else {
      const storedActivities = this.loadFromLocalStorage();
      const uniqueUsers = new Set(storedActivities.map((a: Activity) => a.userId));
      
      if (storedActivities.length === 0 || uniqueUsers.size < 2) {
        await this.loadInitialData();
      } else {
        this.activities.set(storedActivities);
      }
    }
    
    this.isInitialized = true;
  }
  
  resetToInitialData(): void {
    this.storage.remove(APP_CONSTANTS.STORAGE_KEYS.ACTIVITIES);
    this.isInitialized = false;
    this.initialize();
  }

  private async loadFromSupabase(): Promise<void> {
    try {
      const allianceId = this.authService.getAllianceId();
      if (!allianceId) {
        this.activities.set([]);
        return;
      }

      const { data, error} = await this.supabase
        .from('activities')
        .select('id, user_id, activity_type, position, points, date, user_profiles(display_name)')
        .order('date', { ascending: false });

      if (error) throw error;

      const activities: Activity[] = (data as unknown as SupabaseActivity[]).map(dbActivity => ({
        id: dbActivity.id,
        userId: dbActivity.user_id,
        userName: dbActivity.user_profiles.display_name,
        activityType: dbActivity.activity_type,
        position: dbActivity.position,
        points: dbActivity.points,
        date: new Date(dbActivity.date),
        timestamp: new Date(dbActivity.date).getTime()
      }));

      this.activities.set(activities);
    } catch (error) {
      console.error('Error loading activities from Supabase:', error);
      this.activities.set([]);
    }
  }

  private async loadInitialData(): Promise<void> {
    try {
      const mockData = await firstValueFrom(
        this.http.get<MockData>('./assets/data/initial-data.json')
      );
      
      const initialActivities: Activity[] = mockData.activities.map(item => {
        const date = new Date();
        date.setDate(date.getDate() - item.daysAgo);
        
        return {
          id: generateId(),
          userId: item.userId,
          userName: item.userName,
          activityType: item.activityType,
          position: 1, // Default position for legacy data
          points: item.points,
          date: date,
          timestamp: date.getTime()
        };
      });
      
      this.activities.set(initialActivities);
      this.saveToLocalStorage(initialActivities);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      this.activities.set([]);
    }
  }

  getActivities(): Activity[] {
    return this.activities();
  }

  async addActivity(request: ActivityRequest): Promise<{ error: Error | null }> {
    try {
      if (this.useSupabase) {
        return await this.addActivityToSupabase(request);
      } else {
        this.addActivityToLocalStorage(request);
        return { error: null };
      }
    } catch (error) {
      console.error('Error adding activity:', error);
      return { error: error as Error };
    }
  }

  private async addActivityToSupabase(
    request: ActivityRequest
  ): Promise<{ error: Error | null }> {
    const userId = this.authService.getUserId();
    if (!userId) {
      return { error: new Error('User not authenticated') };
    }

    // Calculate points based on position
    const pointsResult = this.pointRulesService.calculatePoints(
      request.activityType,
      request.position
    );

    try {
      const { data, error } = await this.supabase
        .from('activities')
        .insert({
          user_id: userId,
          activity_type: request.activityType,
          position: request.position,
          points: pointsResult.points,
          date: request.date.toISOString()
        })
        .select('id, user_id, activity_type, position, points, date, user_profiles(display_name)')
        .single();

      if (error) throw error;

      const dbActivity = data as unknown as SupabaseActivity;
      const newActivity: Activity = {
        id: dbActivity.id,
        userId: dbActivity.user_id,
        userName: dbActivity.user_profiles.display_name,
        activityType: dbActivity.activity_type,
        position: dbActivity.position,
        points: dbActivity.points,
        date: new Date(dbActivity.date),
        timestamp: new Date(dbActivity.date).getTime()
      };

      this.activities.update(current => [newActivity, ...current]);
      return { error: null };
    } catch (error) {
      console.error('Error adding activity to Supabase:', error);
      return { error: error as Error };
    }
  }

  private addActivityToLocalStorage(
    request: ActivityRequest
  ): void {
    // Calculate points based on position
    const pointsResult = this.pointRulesService.calculatePoints(
      request.activityType,
      request.position
    );

    const profile = this.authService.userProfile();
    const newActivity: Activity = {
      id: generateId(),
      userId: profile?.id || 'local-user',
      userName: profile?.display_name || 'Local User',
      activityType: request.activityType,
      position: request.position,
      points: pointsResult.points,
      date: request.date,
      timestamp: Date.now()
    };
    
    this.activities.update(current => [...current, newActivity]);
    this.saveToLocalStorage(this.activities());
  }

  getUserScores(): UserScore[] {
    const activities = this.activities();
    const sixWeeksAgo = new Date();
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - APP_CONSTANTS.SCORING.TOTAL_DAYS);

    const recentActivities = activities.filter(
      activity => new Date(activity.date) >= sixWeeksAgo
    );

    const userMap = new Map<string, Activity[]>();
    recentActivities.forEach(activity => {
      const userActivities = userMap.get(activity.userId) || [];
      userActivities.push(activity);
      userMap.set(activity.userId, userActivities);
    });

    const userScores: UserScore[] = [];
    userMap.forEach((activities, userId) => {
      const userName = activities[0]?.userName || 'Unknown';
      const weeklyScores = this.calculateWeeklyScores(activities);
      const sixWeekTotal = weeklyScores.reduce((sum, week) => sum + week.totalPoints, 0);
      const averageWeekly = sixWeekTotal / APP_CONSTANTS.SCORING.WEEKS_TO_TRACK;

      userScores.push({
        userId,
        userName,
        weeklyScores,
        sixWeekTotal,
        averageWeekly
      });
    });

    return userScores.sort((a, b) => b.sixWeekTotal - a.sixWeekTotal);
  }

  private calculateWeeklyScores(activities: Activity[]): WeeklyScore[] {
    const weeks: WeeklyScore[] = [];
    const today = new Date();

    for (let i = 0; i < APP_CONSTANTS.SCORING.WEEKS_TO_TRACK; i++) {
      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() - (i * APP_CONSTANTS.SCORING.DAYS_PER_WEEK));
      weekEnd.setHours(23, 59, 59, 999);

      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - (APP_CONSTANTS.SCORING.DAYS_PER_WEEK - 1));
      weekStart.setHours(0, 0, 0, 0);

      const weekActivities = activities.filter(activity => {
        const activityDate = new Date(activity.date);
        return activityDate >= weekStart && activityDate <= weekEnd;
      });

      const totalPoints = weekActivities.reduce((sum, activity) => sum + activity.points, 0);

      weeks.push({
        weekStart,
        weekEnd,
        totalPoints,
        activities: weekActivities
      });
    }

    return weeks;
  }

  private loadFromLocalStorage(): Activity[] {
    const stored = this.storage.get<Activity[]>(APP_CONSTANTS.STORAGE_KEYS.ACTIVITIES);
    if (stored) {
      return stored.map((activity: Activity) => ({
        ...activity,
        date: new Date(activity.date)
      }));
    }
    return [];
  }

  private saveToLocalStorage(activities: Activity[]): void {
    this.storage.set(APP_CONSTANTS.STORAGE_KEYS.ACTIVITIES, activities);
  }
}
