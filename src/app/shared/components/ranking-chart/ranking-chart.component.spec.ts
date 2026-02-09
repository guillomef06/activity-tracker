import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RankingChartComponent } from './ranking-chart.component';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ActivityService } from '../../../core/services/activity.service';
import { provideHttpClient } from '@angular/common/http';

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
        provideAnimations(),
        provideHttpClient(),
        ActivityService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RankingChartComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with user scores from service', () => {
    fixture.detectChanges();
    expect(component.userScores()).toBeDefined();
    expect(Array.isArray(component.userScores())).toBe(true);
  });

  it('should emit hasData output', (done) => {
    component.hasData.subscribe((hasData: boolean) => {
      expect(typeof hasData).toBe('boolean');
      done();
    });
    
    fixture.detectChanges();
  });
});
