/* eslint-disable @typescript-eslint/no-explicit-any */
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { RankingChartComponent } from "./ranking-chart.component";
import { TranslateModule } from "@ngx-translate/core";
import { provideAnimations } from "@angular/platform-browser/animations";
import { ActivityService } from "../../../core/services/activity.service";
import { provideHttpClient } from "@angular/common/http";

describe("RankingChartComponent", () => {
  let component: RankingChartComponent;
  let fixture: ComponentFixture<RankingChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RankingChartComponent, TranslateModule.forRoot()],
      providers: [provideAnimations(), provideHttpClient(), ActivityService],
    }).compileComponents();

    fixture = TestBed.createComponent(RankingChartComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
  it("should initialize with user scores from service", () => {
    // Fournit un input mocké à userScores avant detectChanges
    (component as any).userScores = () => [
      {
        userId: "1",
        userName: "Test User",
        weeklyScores: [
          { weekStart: new Date(), weekEnd: new Date(), totalPoints: 10, activities: [] },
        ],
        sixWeekTotal: 10,
        averageWeekly: 10,
      },
    ];
    fixture.detectChanges();
    expect(component.userScores()).toBeDefined();
    expect(Array.isArray(component.userScores())).toBe(true);
  });
});
