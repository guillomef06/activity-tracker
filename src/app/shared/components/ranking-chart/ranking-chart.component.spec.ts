import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RankingChartComponent } from './ranking-chart.component';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';

describe('RankingChartComponent', () => {
  let component: RankingChartComponent;
  let fixture: ComponentFixture<RankingChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        RankingChartComponent,
        TranslateModule.forRoot()
      ],
      providers: [
        provideAnimations()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RankingChartComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty user scores', () => {
    fixture.detectChanges();
    expect(component.userScores()).toEqual([]);
  });

  it('should accept user scores input', () => {
    const now = new Date();
    const mockScores = [
      {
        userId: 'user1',
        userName: 'Test User',
        sixWeekTotal: 100,
        averageWeekly: 16.7,
        weeklyScores: [
          { weekStart: now, weekEnd: now, totalPoints: 20, activities: [] },
          { weekStart: now, weekEnd: now, totalPoints: 30, activities: [] },
          { weekStart: now, weekEnd: now, totalPoints: 25, activities: [] },
          { weekStart: now, weekEnd: now, totalPoints: 25, activities: [] },
          { weekStart: now, weekEnd: now, totalPoints: 0, activities: [] },
          { weekStart: now, weekEnd: now, totalPoints: 0, activities: [] }
        ]
      }
    ];

    // Use fixture.componentRef to set input signals
    fixture.componentRef.setInput('userScores', mockScores);
    fixture.detectChanges();
    
    expect(component.userScores().length).toBe(1);
    expect(component.userScores()[0].userName).toBe('Test User');
  });
});
