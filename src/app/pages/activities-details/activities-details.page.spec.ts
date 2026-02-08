import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivitiesDetailsPage } from './activities-details.page';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

describe('ActivitiesDetailsPage', () => {
  let component: ActivitiesDetailsPage;
  let fixture: ComponentFixture<ActivitiesDetailsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivitiesDetailsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivitiesDetailsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
