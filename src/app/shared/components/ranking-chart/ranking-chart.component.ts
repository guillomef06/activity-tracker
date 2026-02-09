import { Component, ViewChild, ElementRef, AfterViewInit, ChangeDetectionStrategy, inject, signal, effect, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { UserScore } from '../../../shared/models/activity.model';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { APP_CONSTANTS } from '../../constants/constants';
import { ActivityService } from '../../../core/services/activity.service';

Chart.register(...registerables);

@Component({
  selector: 'app-ranking-chart',
  standalone: true,
  imports: [CommonModule, MatCardModule, TranslateModule],
  templateUrl: './ranking-chart.component.html',
  styleUrl: './ranking-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RankingChartComponent implements AfterViewInit {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;
  
  private activityService = inject(ActivityService);
  private translate = inject(TranslateService);
  private chart: Chart | null = null;
  private viewInitialized = false;

  userScores = signal<UserScore[]>([]);
  
  // Output to notify parent if data exists
  hasData = output<boolean>();

  constructor() {
    // Load scores with reversed weekly data for chronological chart display
    effect(() => {
      const scores = this.activityService.getUserScores().map(userScore => ({
        ...userScore,
        weeklyScores: [...userScore.weeklyScores].reverse()
      }));
      this.userScores.set(scores);
      this.hasData.emit(scores.length > 0);
      
      if (this.viewInitialized && scores.length > 0) {
        this.updateChart();
      }
    });
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.createChart();
  }

  private createChart(): void {
    if (!this.chartCanvas || this.userScores().length === 0) return;

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: [
          this.translate.instant('dashboard.week') + ' 1',
          this.translate.instant('dashboard.week') + ' 2',
          this.translate.instant('dashboard.week') + ' 3',
          this.translate.instant('dashboard.week') + ' 4',
          this.translate.instant('dashboard.week') + ' 5',
          this.translate.instant('dashboard.week') + ' 6'
        ],
        datasets: this.getDatasets()
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            position: 'top',
          },
          title: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                return `${context.dataset.label}: ${context.parsed.y} ${this.translate.instant('common.points')}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: this.translate.instant('common.points')
            }
          },
          x: {
            title: {
              display: true,
              text: this.translate.instant('dashboard.week')
            }
          }
        }
      }
    };

    this.chart = new Chart(ctx, config);
  }

  private updateChart(): void {
    if (!this.chart) {
      this.createChart();
      return;
    }

    this.chart.data.datasets = this.getDatasets();
    this.chart.update();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getDatasets(): any[] {
    // Use colors from constants
    const colors = APP_CONSTANTS.CHART_COLORS;

    return this.userScores().map((userScore, index) => {
      const color = colors[index % colors.length];
      return {
        label: userScore.userName,
        data: userScore.weeklyScores.map(week => week.totalPoints),
        borderColor: color.border,
        backgroundColor: color.background,
        tension: 0.1,
        fill: false
      };
    });
  }
}
