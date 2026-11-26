import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

import { CalendarService, MG_CAL_ERROR_KEYS } from '@app/core/services/calendar.service';
import { SnackbarService } from '@app/core/services';
import { BackToDashboardButtonComponent } from '@app/pages/super-admin/components/back-to-dashboard-button/back-to-dashboard-button.component';
import type {
  CalendarEntryWithImpact,
  CalendarOperationError,
  CreateEntryResult,
  IsoDate,
  OtherEntryInput,
} from '@shared/models';
import { toIsoDate } from '@shared/utils/mg-calendar.util';
import { resolveCalendarErrorKey } from './calendar-error-key.util';
import type { CalendarConfirmDialogData, CalendarRowVm, MgShiftDialogData } from './calendar-page.models';
import { buildCalendarSections } from './calendar-rows.util';
import { CalendarConfirmDialogComponent } from './components/calendar-confirm-dialog/calendar-confirm-dialog.component';
import { CalendarEntryListComponent } from './components/calendar-entry-list/calendar-entry-list.component';
import { MgEntryWizardComponent } from './components/mg-entry-wizard/mg-entry-wizard.component';
import { MgShiftDialogComponent } from './components/mg-shift-dialog/mg-shift-dialog.component';
import { OtherEntryFormComponent } from './components/other-entry-form/other-entry-form.component';

type EditorMode = 'none' | 'wizard' | 'form';

const SAVED_KEY = 'superAdmin.calendar.saved';
const SHIFTED_KEY = 'superAdmin.calendar.shifted';
const CANCELLED_KEY = 'superAdmin.calendar.cancelled';
const DELETED_KEY = 'superAdmin.calendar.deleted';

@Component({
  selector: 'app-super-admin-calendar',
  imports: [
    BackToDashboardButtonComponent,
    CalendarEntryListComponent,
    MgEntryWizardComponent,
    OtherEntryFormComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './super-admin-calendar.page.html',
  styleUrl: './super-admin-calendar.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminCalendarPage {
  private readonly calendarService = inject(CalendarService);
  private readonly snackbar = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  /** UTC day used by every derivation; refreshed each time the entries are (re)loaded. */
  protected readonly today = signal<IsoDate>(toIsoDate(new Date()));

  // resource(): the loader is a one-shot Promise, not an event stream.
  protected readonly entriesResource = resource({
    loader: async (): Promise<CalendarEntryWithImpact[]> => {
      this.today.set(toIsoDate(new Date()));
      return this.calendarService.loadEntriesWithImpact();
    },
  });

  protected readonly entries = computed<readonly CalendarEntryWithImpact[]>(() =>
    this.entriesResource.hasValue() ? this.entriesResource.value() : []
  );
  private readonly sections = computed(() => buildCalendarSections(this.entries(), this.today()));
  protected readonly upcomingRows = computed(() => this.sections().upcoming);
  protected readonly historyRows = computed(() => this.sections().history);
  protected readonly isEmpty = computed(
    () => this.entriesResource.hasValue() && this.upcomingRows().length + this.historyRows().length === 0
  );

  protected readonly mode = signal<EditorMode>('none');
  protected readonly busy = signal(false);
  protected readonly wizardResults = signal<readonly CreateEntryResult[] | null>(null);
  private readonly editingId = signal<string | null>(null);
  protected readonly editingInitial = computed<OtherEntryInput | null>(() => {
    const entry = this.entries().find(candidate => candidate.id === this.editingId());
    if (!entry || entry.type === 'mg') return null;
    return {
      type: entry.type,
      title: entry.title ?? '',
      starts_at: entry.starts_at,
      ends_at: entry.ends_at,
      all_day: entry.all_day,
    };
  });

  // ─── editors (wizard / form) ───────────────────────────────────────────────

  protected openWizard(): void {
    this.wizardResults.set(null);
    this.mode.set('wizard');
  }

  protected openForm(): void {
    this.editingId.set(null);
    this.mode.set('form');
  }

  protected closeEditor(): void {
    this.mode.set('none');
    this.editingId.set(null);
    this.wizardResults.set(null);
  }

  protected onEdit(id: string): void {
    this.editingId.set(id);
    this.mode.set('form');
  }

  protected async onWizardSubmitted(openingMondays: IsoDate[]): Promise<void> {
    this.busy.set(true);
    const { results, error } = await this.calendarService.createMgEntries(openingMondays);
    this.busy.set(false);
    if (error) return this.reportError(error);
    this.wizardResults.set(results);
    this.onSuccess(SAVED_KEY);
  }

  protected async onFormSaved(input: OtherEntryInput): Promise<void> {
    const id = this.editingId();
    this.busy.set(true);
    const { error } = id
      ? await this.calendarService.updateOtherEntry(id, input)
      : await this.calendarService.createOtherEntry(input);
    this.busy.set(false);
    if (error) return this.reportUnknownError(error);
    this.closeEditor();
    this.onSuccess(SAVED_KEY);
  }

  // ─── row actions ───────────────────────────────────────────────────────────

  protected async onShift(id: string): Promise<void> {
    const row = this.findRow(id);
    if (!row) return;
    const data: MgShiftDialogData = {
      entries: this.entries(),
      selectedId: id,
      today: this.today(),
      servers: row.servers,
      registrations: row.registrations,
    };
    const newOpeningMonday = await firstValueFrom(
      this.dialog
        .open<MgShiftDialogComponent, MgShiftDialogData, IsoDate>(MgShiftDialogComponent, { data })
        .afterClosed()
    );
    if (!newOpeningMonday) return;
    const { error } = await this.runBusy(() => this.calendarService.shiftMgEntry(id, newOpeningMonday));
    if (error) return this.reportError(error);
    this.onSuccess(SHIFTED_KEY);
  }

  protected async onCancel(id: string): Promise<void> {
    const row = this.findRow(id);
    if (!row) return;
    const data: CalendarConfirmDialogData = {
      variant: 'cancel',
      label: row.startDay,
      servers: row.servers,
      registrations: row.registrations,
    };
    if (!(await this.confirm(data))) return;
    const { error } = await this.runBusy(() => this.calendarService.cancelMgEntry(id));
    if (error) return this.reportError(error);
    this.onSuccess(CANCELLED_KEY);
  }

  protected async onDelete(id: string): Promise<void> {
    const row = this.findRow(id);
    if (!row) return;
    const data: CalendarConfirmDialogData = {
      variant: 'delete',
      label: row.title ?? row.startDay,
      servers: 0,
      registrations: 0,
    };
    if (!(await this.confirm(data))) return;
    const { error } = await this.runBusy(() => this.calendarService.deleteOtherEntry(id));
    if (error) return this.reportUnknownError(error);
    this.onSuccess(DELETED_KEY);
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  private findRow(id: string): CalendarRowVm | undefined {
    return [...this.upcomingRows(), ...this.historyRows()].find(row => row.id === id);
  }

  private async confirm(data: CalendarConfirmDialogData): Promise<boolean> {
    const result = await firstValueFrom(
      this.dialog
        .open<CalendarConfirmDialogComponent, CalendarConfirmDialogData, true>(CalendarConfirmDialogComponent, { data })
        .afterClosed()
    );
    return result === true;
  }

  private async runBusy<T>(call: () => Promise<T>): Promise<T> {
    this.busy.set(true);
    try {
      return await call();
    } finally {
      this.busy.set(false);
    }
  }

  private onSuccess(messageKey: string): void {
    this.entriesResource.reload();
    this.snackbar.success(this.translate.instant(messageKey));
  }

  private reportError(error: CalendarOperationError): void {
    this.snackbar.error(this.translate.instant(resolveCalendarErrorKey(error.code, error.details)));
  }

  /** Direct writes (non-MG entries) surface a raw Supabase error: only the generic message applies. */
  private reportUnknownError(error: unknown): void {
    console.error('Calendar write failed:', error);
    this.snackbar.error(this.translate.instant(MG_CAL_ERROR_KEYS.MG_CAL_UNKNOWN));
  }
}
