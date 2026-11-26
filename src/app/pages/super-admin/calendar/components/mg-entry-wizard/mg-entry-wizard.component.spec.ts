import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, WritableSignal } from '@angular/core';
import { provideNativeDateAdapter } from '@angular/material/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import type { CreateEntryResult, IsoDate, MgEntryLike } from '@shared/models/calendar-entry.model';
import { MgEntryWizardComponent } from './mg-entry-wizard.component';

const TRANSLATIONS = {
  common: { cancel: 'Cancel', next: 'Next', back: 'Back', close: 'Close' },
  errors: { required: 'Required' },
  superAdmin: {
    calendar: {
      wizard: {
        title: 'Add MG events',
        stepDates: 'Dates',
        stepPreview: 'Preview',
        stepResult: 'Result',
        openingMonday: 'Opening Monday',
        openingMondayHint: 'Registrations open on this Monday',
        duplicate: 'Duplicate every 2 weeks',
        weeks: 'Weeks',
        weeksHint: 'Even number, 2 to 26',
        previewOpening: 'Opening',
        previewClosing: 'Closing',
        previewStart: 'Start',
        previewEnd: 'End',
        confirm: 'Create',
        resultTitle: 'Result per date',
        outcome: {
          created: 'Created',
          alreadyExists: 'Already exists, ignored',
          rejectedNotMonday: 'Refused: not a Monday',
          rejectedOpeningPassed: 'Refused: opening passed',
          rejectedTooClose: 'Refused: too close',
        },
      },
      errors: {
        weeksEven: 'Weeks must be even',
        weeksRange: 'Weeks must be 2 to 26',
        notMonday: 'Must be a Monday',
      },
    },
  },
};

interface WizardFormValue {
  openingMonday: Date | null;
  duplicate: boolean;
  weeks: number;
}

/** Test-only view of the protected members, so the spec drives the model without a date picker UI. */
interface WizardInternals {
  wizardModel: WritableSignal<WizardFormValue>;
  goToPreview(): void;
  stepIndex: WritableSignal<number>;
}

const MONDAY_MAY_31 = new Date(2027, 4, 31);
const FAR_PAST_TODAY: IsoDate = '2027-05-20';

const mgEntry = (id: string, start: string, cancelledAt: string | null = null): MgEntryLike => ({
  id,
  type: 'mg',
  starts_at: `${start}T00:00:00.000Z`,
  cancelled_at: cancelledAt,
});

describe('MgEntryWizardComponent', () => {
  let fixture: ComponentFixture<MgEntryWizardComponent>;
  let internals: WizardInternals;
  let submitted: IsoDate[][];
  let closedCount: number;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (selector: string): string => root().querySelector(selector)?.textContent ?? '';
  const click = (selector: string): void => {
    (root().querySelector(selector) as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  const setInputs = (inputs: {
    existing?: MgEntryLike[];
    today?: IsoDate;
    results?: CreateEntryResult[] | null;
    busy?: boolean;
  }): void => {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  };

  const fill = (value: Partial<WizardFormValue>): void => {
    internals.wizardModel.update(model => ({ ...model, ...value }));
    fixture.detectChanges();
  };

  const openPreview = (value: Partial<WizardFormValue>): void => {
    fill(value);
    internals.goToPreview();
    fixture.detectChanges();
  };

  const previewRows = (): HTMLElement[] => Array.from(root().querySelectorAll<HTMLElement>('.preview-row'));
  const confirmButton = (): HTMLButtonElement => root().querySelector('.confirm-button') as HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MgEntryWizardComponent, TranslateModule.forRoot()],
      providers: [provideZonelessChangeDetection(), provideNativeDateAdapter()],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', TRANSLATIONS);
    translate.use('en');

    fixture = TestBed.createComponent(MgEntryWizardComponent);
    internals = fixture.componentInstance as unknown as WizardInternals;
    submitted = [];
    closedCount = 0;
    fixture.componentInstance.submitted.subscribe(openings => submitted.push(openings));
    fixture.componentInstance.closed.subscribe(() => (closedCount += 1));
    fixture.componentRef.setInput('existing', []);
    fixture.componentRef.setInput('today', FAR_PAST_TODAY);
    fixture.detectChanges();
  });

  describe('dates step', () => {
    it('should stay on the dates step and flag the required opening Monday when nothing is picked', () => {
      click('.next-button');

      expect(internals.stepIndex()).toBe(0);
      expect(text('.field-error')).toContain('Required');
    });

    it.each([3, 0, 28])('should refuse %i weeks before the preview', weeks => {
      fill({ openingMonday: MONDAY_MAY_31, duplicate: true, weeks });

      click('.next-button');

      expect(internals.stepIndex()).toBe(0);
      expect(previewRows()).toHaveLength(0);
      expect(root().querySelector('.weeks-input')).not.toBeNull();
    });

    it('should explain an odd number of weeks', () => {
      fill({ openingMonday: MONDAY_MAY_31, duplicate: true, weeks: 3 });

      click('.next-button');

      expect(text('mat-error')).toContain('Weeks must be even');
    });

    it('should explain an out-of-range number of weeks', () => {
      fill({ openingMonday: MONDAY_MAY_31, duplicate: true, weeks: 28 });

      click('.next-button');

      expect(text('mat-error')).toContain('Weeks must be 2 to 26');
    });

    it('should refuse a picked date that is not a Monday', () => {
      fill({ openingMonday: new Date(2027, 5, 1) });

      click('.next-button');

      expect(internals.stepIndex()).toBe(0);
      expect(text('.field-error')).toContain('Must be a Monday');
    });

    it('should ignore the weeks value when duplication is off', () => {
      fill({ openingMonday: MONDAY_MAY_31, duplicate: false, weeks: 3 });

      click('.next-button');

      expect(internals.stepIndex()).toBe(1);
    });

    it('should tell that the picked Monday is the opening Monday', () => {
      expect(text('mat-hint')).toContain('Registrations open on this Monday');
      expect(text('mat-label')).toContain('Opening Monday');
    });
  });

  describe('preview step', () => {
    it('should list the derived dates of a single MG', () => {
      openPreview({ openingMonday: MONDAY_MAY_31 });

      const rows = previewRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('May 31, 2027');
      expect(rows[0].textContent).toContain('Jun 3, 2027');
      expect(rows[0].textContent).toContain('Jun 7, 2027');
      expect(rows[0].textContent).toContain('Jun 13, 2027');
      expect(rows[0].textContent).toContain('Created');
    });

    it('should list two MG when duplicating over 4 weeks', () => {
      openPreview({ openingMonday: MONDAY_MAY_31, duplicate: true, weeks: 4 });

      const rows = previewRows();
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toContain('Jun 7, 2027');
      expect(rows[1].textContent).toContain('Jun 14, 2027');
      expect(rows[1].textContent).toContain('Jun 21, 2027');
      expect(rows[1].textContent).toContain('Jun 27, 2027');
    });

    it('should flag an existing date as ignored without blocking the others', () => {
      setInputs({ existing: [mgEntry('a', '2027-06-07')] });

      openPreview({ openingMonday: MONDAY_MAY_31, duplicate: true, weeks: 4 });

      const rows = previewRows();
      expect(rows[0].textContent).toContain('Already exists, ignored');
      expect(rows[1].textContent).toContain('Created');
      expect(confirmButton().disabled).toBe(false);
    });

    it('should disable confirm when every date already exists', () => {
      setInputs({ existing: [mgEntry('a', '2027-06-07'), mgEntry('b', '2027-06-21')] });

      openPreview({ openingMonday: MONDAY_MAY_31, duplicate: true, weeks: 4 });

      expect(confirmButton().disabled).toBe(true);
    });

    it('should refuse an opening Monday that already passed', () => {
      setInputs({ today: '2027-06-02' });

      openPreview({ openingMonday: MONDAY_MAY_31 });

      expect(previewRows()[0].textContent).toContain('Refused: opening passed');
      expect(confirmButton().disabled).toBe(true);
    });

    it('should accept the same opening Monday the day before', () => {
      setInputs({ today: '2027-05-30' });

      openPreview({ openingMonday: MONDAY_MAY_31 });

      expect(previewRows()[0].textContent).toContain('Created');
      expect(confirmButton().disabled).toBe(false);
    });

    it('should refuse a date less than 14 days from another MG', () => {
      setInputs({ existing: [mgEntry('a', '2027-06-14')] });

      openPreview({ openingMonday: MONDAY_MAY_31 });

      expect(previewRows()[0].textContent).toContain('Refused: too close');
    });

    it('should disable confirm while busy', () => {
      setInputs({ busy: true });

      openPreview({ openingMonday: MONDAY_MAY_31 });

      expect(confirmButton().disabled).toBe(true);
    });

    it.each([new Date(2027, 4, 31, 0, 0), new Date(2027, 4, 31, 23, 59)])(
      'should anchor the picked day %s on its calendar day whatever the local time of day',
      picked => {
        openPreview({ openingMonday: picked });

        click('.confirm-button');

        expect(submitted).toEqual([['2027-05-31']]);
      }
    );
  });

  describe('submission and closing', () => {
    it('should emit only the opening Mondays classified as created', () => {
      setInputs({ existing: [mgEntry('a', '2027-06-07')] });
      openPreview({ openingMonday: MONDAY_MAY_31, duplicate: true, weeks: 4 });

      click('.confirm-button');

      expect(submitted).toEqual([['2027-06-14']]);
      expect(closedCount).toBe(0);
    });

    it('should emit closed and nothing else when closed from the dates step', () => {
      click('.close-button');

      expect(closedCount).toBe(1);
      expect(submitted).toHaveLength(0);
    });

    it('should emit closed and never submitted when closed from the preview', () => {
      openPreview({ openingMonday: MONDAY_MAY_31 });

      click('.close-button');

      expect(closedCount).toBe(1);
      expect(submitted).toHaveLength(0);
    });

    it('should go back to the dates step from the preview', () => {
      openPreview({ openingMonday: MONDAY_MAY_31 });

      click('.back-button');

      expect(internals.stepIndex()).toBe(0);
    });
  });

  describe('result step', () => {
    const RESULTS: CreateEntryResult[] = [
      { opening_monday: '2027-05-31', mg_start: '2027-06-07', outcome: 'created', entry_id: 'e1' },
      { opening_monday: '2027-06-14', mg_start: '2027-06-21', outcome: 'already_exists', entry_id: null },
      { opening_monday: '2027-06-28', mg_start: '2027-07-05', outcome: 'rejected_not_monday', entry_id: null },
      { opening_monday: '2027-07-12', mg_start: '2027-07-19', outcome: 'rejected_opening_passed', entry_id: null },
      { opening_monday: '2027-07-26', mg_start: '2027-08-02', outcome: 'rejected_too_close', entry_id: null },
    ];

    it('should show the result step and one line per date when results arrive', () => {
      openPreview({ openingMonday: MONDAY_MAY_31 });

      setInputs({ results: RESULTS });

      const rows = Array.from(root().querySelectorAll<HTMLElement>('.result-row'));
      expect(internals.stepIndex()).toBe(2);
      expect(rows).toHaveLength(5);
      expect(rows[0].textContent).toContain('May 31, 2027');
      expect(rows[0].textContent).toContain('Created');
      expect(rows[1].textContent).toContain('Already exists, ignored');
      expect(rows[2].textContent).toContain('Refused: not a Monday');
      expect(rows[3].textContent).toContain('Refused: opening passed');
      expect(rows[4].textContent).toContain('Refused: too close');
    });

    it('should render no result line before results are provided', () => {
      expect(root().querySelectorAll('.result-row')).toHaveLength(0);
    });
  });
});
