import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GuideChampionCardComponent } from './guide-champion-card.component';
import { TranslateModule } from '@ngx-translate/core';
import type { GuideChampion } from '@shared/models';

const MOCK_CHAMPION: GuideChampion = {
  id: 'gc-1',
  guide_id: 'guide-1',
  position: 0,
  champion_id: 'champ-1',
  ornament_id: null,
  ring_id: null,
  champions: { id: 'champ-1', name: 'Attila', image_url: null, sort_order: 1, is_active: true },
  ornaments: undefined,
  rings: undefined,
  guide_champion_skills: [],
  guide_champion_gems: [],
  guide_champion_horse_traits: [],
};

describe('GuideChampionCardComponent', () => {
  let component: GuideChampionCardComponent;
  let fixture: ComponentFixture<GuideChampionCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuideChampionCardComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(GuideChampionCardComponent);
    fixture.componentRef.setInput('champion', MOCK_CHAMPION);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display champion name', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.champion-name')?.textContent).toContain('Attila');
  });

  it('should show avatar placeholder when no image_url', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.champion-avatar-placeholder')).toBeTruthy();
    expect(compiled.querySelector('.champion-avatar')).toBeNull();
  });

  it('should show avatar image when image_url is set', () => {
    const withImage: GuideChampion = {
      ...MOCK_CHAMPION,
      champions: { ...MOCK_CHAMPION.champions!, image_url: 'https://example.com/img.png' },
    };
    fixture.componentRef.setInput('champion', withImage);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.champion-avatar')).toBeTruthy();
    expect(compiled.querySelector('.champion-avatar-placeholder')).toBeNull();
  });

  it('should not render skill row when no skills', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const icons = Array.from(compiled.querySelectorAll('.detail-icon'));
    const skillRow = icons.find(el => el.textContent?.trim() === 'flash_on');
    expect(skillRow).toBeUndefined();
  });

  it('should render skills row when skills are present', () => {
    const withSkills: GuideChampion = {
      ...MOCK_CHAMPION,
      guide_champion_skills: [
        {
          id: 's1',
          guide_champion_id: 'gc-1',
          skill_id: 'sk-1',
          slot: 1,
          skills: { id: 'sk-1', name: 'Rally', description: null, icon_url: null, is_active: true, sort_order: 1 },
        },
      ],
    };
    fixture.componentRef.setInput('champion', withSkills);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Rally');
  });
});
