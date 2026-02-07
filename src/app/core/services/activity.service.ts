import { Injectable, signal, computed } from '@angular/core';
import { Activity, UserScore, WeeklyScore } from '../../shared/models/activity.model';

@Injectable({
  providedIn: 'root'
})
export class ActivityService {
  private activities = signal<Activity[]>(this.loadActivities());
  
  // Public readonly signal for components to consume
  readonly activitiesSignal = this.activities.asReadonly();
  
  getActivities(): Activity[] {
    return this.activities();
  }

  addActivity(activity: Omit<Activity, 'id' | 'timestamp'>): void {
    const newActivity: Activity = {
      ...activity,
      id: this.generateId(),
      timestamp: Date.now()
    };
    
    this.activities.update(current => [...current, newActivity]);
    this.saveActivities(this.activities());
  }

  getUserScores(): UserScore[] {
    const activities = this.activities();
    const sixWeeksAgo = new Date();
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42); // 6 weeks

    // Filter activities from last 6 weeks
    const recentActivities = activities.filter(
      activity => new Date(activity.date) >= sixWeeksAgo
    );

    // Group by user
    const userMap = new Map<string, Activity[]>();
    recentActivities.forEach(activity => {
      const userActivities = userMap.get(activity.userId) || [];
      userActivities.push(activity);
      userMap.set(activity.userId, userActivities);
    });

    // Calculate scores for each user
    const userScores: UserScore[] = [];
    userMap.forEach((activities, userId) => {
      const userName = activities[0]?.userName || 'Unknown';
      const weeklyScores = this.calculateWeeklyScores(activities);
      const sixWeekTotal = weeklyScores.reduce((sum, week) => sum + week.totalPoints, 0);
      const averageWeekly = sixWeekTotal / 6;

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

    for (let i = 0; i < 6; i++) {
      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() - (i * 7));
      weekEnd.setHours(23, 59, 59, 999);

      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);

      const weekActivities = activities.filter(activity => {
        const activityDate = new Date(activity.date);
        return activityDate >= weekStart && activityDate <= weekEnd;
      });

      const totalPoints = weekActivities.reduce((sum, activity) => sum + activity.points, 0);

      weeks.unshift({
        weekStart,
        weekEnd,
        totalPoints,
        activities: weekActivities
      });
    }

    return weeks;
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadActivities(): Activity[] {
    const stored = localStorage.getItem('activities');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      return parsed.map((activity: Activity) => ({
        ...activity,
        date: new Date(activity.date)
      }));
    }
    return [];
  }

  private saveActivities(activities: Activity[]): void {
    localStorage.setItem('activities', JSON.stringify(activities));
  }
}
