import { Component, input, computed, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import * as XLSX from 'xlsx';

import { ActivityService, SnackbarService } from '@app/core/services';
import { ServerService } from '@app/core/services/server.service';
import { SeasonService } from '@app/core/services/season.service';
import { APP_CONSTANTS, ActivityType } from '@app/shared/constants/constants';
import { getWeekStart } from '@app/shared/utils/date.util';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import type { Activity, UserProfile, SeasonWithWeeks } from '@app/shared/models';

const LEGION_ACTIVITY_TYPE = 'legion';

interface ImportRow {
  rowIndex: number;
  rawPlayerName: string;
  activityType: string;
  activityLabelKey: string | null;
  rawPosition: string;
  rawEventDate: string;
  matchedMember: UserProfile | null;
  eventDate: Date | null;
  weekStart: Date | null;
  weeksAgo: number | null;
  position: number | null;
  points: number;
  isExisting: boolean;
  includeUpdate: boolean;
  validationError: string | null;
  status: 'ready' | 'willUpdate' | 'unmatched' | 'invalid';
}

interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
}

@Component({
  selector: 'app-import-excel-tab',
  imports: [
    CommonModule,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatTableModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatTooltipModule,
    MatDividerModule,
    TranslateModule,
    LoadingButtonComponent,
  ],
  templateUrl: './import-excel-tab.component.html',
  styleUrl: './import-excel-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportExcelTabComponent {
  private readonly activityService = inject(ActivityService);
  private readonly serverService = inject(ServerService);
  private readonly seasonService = inject(SeasonService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translate = inject(TranslateService);

  members = input.required<UserProfile[]>();

  protected readonly step = signal<'upload' | 'preview' | 'done'>('upload');
  protected readonly isImporting = signal(false);
  protected readonly activityFilter = signal<string>('all');
  protected readonly rows = signal<ImportRow[]>([]);
  protected readonly importResult = signal<ImportResult | null>(null);

  protected readonly activityTypes = APP_CONSTANTS.ACTIVITY_TYPES;

  protected readonly displayedColumns = ['status', 'player', 'activity', 'position', 'week', 'points', 'update'];

  protected readonly filteredRows = computed(() => {
    const filter = this.activityFilter();
    return filter === 'all' ? this.rows() : this.rows().filter(r => r.activityType === filter);
  });

  protected readonly rowsToInsert = computed(() => this.filteredRows().filter(r => r.status === 'ready'));

  protected readonly rowsToUpdate = computed(() =>
    this.filteredRows().filter(r => r.status === 'willUpdate' && r.includeUpdate)
  );

  protected readonly skippedRows = computed(() =>
    this.filteredRows().filter(
      r => r.status === 'unmatched' || r.status === 'invalid' || (r.status === 'willUpdate' && !r.includeUpdate)
    )
  );

  protected readonly hasExistingRows = computed(() =>
    this.filteredRows().some(r => r.isExisting && r.matchedMember && !r.validationError)
  );

  protected readonly existingRows = computed(() =>
    this.filteredRows().filter(r => r.isExisting && r.matchedMember && !r.validationError)
  );

  protected readonly canImport = computed(
    () => !this.isImporting() && this.rowsToInsert().length + this.rowsToUpdate().length > 0
  );

  protected downloadTemplate(): void {
    const wb = XLSX.utils.book_new();

    // Import sheet
    const headers = ['player_name', 'activity_type', 'position', 'event_date'];
    const example = ['ExamplePlayer', 'legion', '5', '2026-03-03'];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = [{ wch: 25 }, { wch: 22 }, { wch: 12 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Import');

    // Reference sheet — valid activity type values and their current-season week assignment
    const refHeaders = ['activity_type', 'default_points', 'available_weeks_current_season'];
    const refRows = this.buildSeasonReferenceRows();
    const wsRef = XLSX.utils.aoa_to_sheet([refHeaders, ...refRows]);
    wsRef['!cols'] = [{ wch: 25 }, { wch: 16 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsRef, 'Reference');

    XLSX.writeFile(wb, 'activity-import-template.xlsx');
  }

  /**
   * Builds the Reference sheet rows from the season currently active for today's date.
   * Falls back to a single explanatory row (rather than throwing) when no season covers today —
   * this sheet is purely informational for admins preparing a bulk-import spreadsheet.
   */
  private buildSeasonReferenceRows(): (string | number)[][] {
    const activeSeason = this.seasonService.getSeasonForDate(new Date());
    if (!activeSeason) {
      return [[this.translate.instant('server.import.noActiveSeasonReference'), '', '']];
    }

    const weekStarts = this.getSeasonWeekStarts(activeSeason);
    const weekCount = weekStarts.length;

    return this.activityTypes.map((t: ActivityType) => [
      t.value,
      t.points,
      t.value === LEGION_ACTIVITY_TYPE ? this.allWeeksRange(weekCount) : this.weeksForActivityType(t.value, weekStarts),
    ]);
  }

  /** Monday of each of the season's declared weeks, in order (week 1 first). */
  private getSeasonWeekStarts(season: SeasonWithWeeks): Date[] {
    const seasonStart = getWeekStart(new Date(season.startDate));

    return Array.from({ length: season.weekCount }, (_, index) => {
      const weekStart = new Date(seasonStart);
      weekStart.setUTCDate(weekStart.getUTCDate() + index * APP_CONSTANTS.SCORING.DAYS_PER_WEEK);
      return weekStart;
    });
  }

  /** 1-based week indices (within the season) where the given activity type is assigned. */
  private weeksForActivityType(activityTypeValue: string, weekStarts: Date[]): string {
    return weekStarts
      .map((weekStart, index) =>
        this.seasonService.getAvailableActivityTypesForDate(weekStart).some(t => t.value === activityTypeValue)
          ? index + 1
          : null
      )
      .filter((weekIndex): weekIndex is number => weekIndex !== null)
      .join(', ');
  }

  private allWeeksRange(weekCount: number): string {
    return Array.from({ length: weekCount }, (_, index) => index + 1).join(', ');
  }

  protected onFileSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true });
      this.parseRows(rawRows);
    };
    reader.readAsArrayBuffer(file);

    // Reset the input so the same file can be re-selected
    (event.target as HTMLInputElement).value = '';
  }

  private parseRows(rawRows: Record<string, unknown>[]): void {
    const members = this.members();
    const activities = this.activityService.activities();
    const currentWeekStart = getWeekStart(new Date());

    const rows: ImportRow[] = rawRows
      .filter(r => r['player_name'] ?? r['activity_type'])
      .map((r, i) => this.parseRow(r, i, members, activities, currentWeekStart));

    this.rows.set(rows);
    this.step.set('preview');
  }

  private parseRow(
    r: Record<string, unknown>,
    rowIndex: number,
    members: UserProfile[],
    activities: Activity[],
    currentWeekStart: Date
  ): ImportRow {
    const rawPlayerName = String(r['player_name'] ?? '').trim();
    const activityType = String(r['activity_type'] ?? '')
      .trim()
      .toLowerCase();
    const rawPosition = String(r['position'] ?? '').trim();
    const rawEventDate = String(r['event_date'] ?? '').trim();

    const matchedMember = this.matchMember(rawPlayerName, members);
    const activityDef = APP_CONSTANTS.ACTIVITY_TYPES.find((t: ActivityType) => t.value === activityType);
    const activityEnabled = activityDef ? this.serverService.isActivityEnabled(activityType) : false;

    const eventDate = this.parseEventDate(r['event_date']);
    const weekStart = eventDate ? getWeekStart(eventDate) : null;

    let validationError = this.validateRowFields(activityDef, activityEnabled, eventDate);

    const isParticipation = activityDef ? this.serverService.isParticipationMode(activityType) : false;
    let position: number | null = null;
    if (!isParticipation && !validationError) {
      const resolved = this.resolvePosition(r['position'], rawPosition);
      position = resolved.position;
      validationError = resolved.error;
    }

    const points =
      activityDef && !validationError
        ? this.calculateRowPoints(isParticipation, activityType, activityDef, position)
        : 0;

    const weeksAgo: number | null = weekStart
      ? Math.round((currentWeekStart.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
      : null;

    const isExisting =
      matchedMember && weekStart && activityDef && !validationError
        ? this.checkIsExisting(activities, matchedMember.id, activityType, weekStart)
        : false;

    const row: Omit<ImportRow, 'status'> = {
      rowIndex,
      rawPlayerName,
      activityType,
      activityLabelKey: activityDef?.labelKey ?? null,
      rawPosition,
      rawEventDate,
      matchedMember,
      eventDate,
      weekStart,
      weeksAgo,
      position,
      points,
      isExisting,
      includeUpdate: false,
      validationError,
    };

    return { ...row, status: this.buildStatus(row) };
  }

  private matchMember(rawPlayerName: string, members: UserProfile[]): UserProfile | null {
    return (
      members.find(
        m =>
          m.display_name.toLowerCase() === rawPlayerName.toLowerCase() ||
          m.username.toLowerCase() === rawPlayerName.toLowerCase()
      ) ?? null
    );
  }

  /** Parses an event date cell. SheetJS returns Date objects when cellDates: true; falls back to string/serial parsing. */
  private parseEventDate(rawDate: unknown): Date | null {
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      return rawDate;
    }
    if (typeof rawDate === 'string' && rawDate.trim()) {
      const parsed = new Date(rawDate.trim());
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof rawDate === 'number') {
      const parsed = XLSX.SSF.parse_date_code(rawDate);
      return parsed ? new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)) : null;
    }
    return null;
  }

  private validateRowFields(
    activityDef: ActivityType | undefined,
    activityEnabled: boolean,
    eventDate: Date | null
  ): string | null {
    if (!activityDef) return 'invalid_activity';
    if (!activityEnabled) return 'disabled_activity';
    if (!eventDate) return 'invalid_date';
    return null;
  }

  private resolvePosition(
    rawPositionValue: unknown,
    rawPosition: string
  ): { position: number | null; error: string | null } {
    const posNum = typeof rawPositionValue === 'number' ? rawPositionValue : parseInt(rawPosition, 10);
    if (isNaN(posNum) || posNum < 1) {
      return { position: null, error: 'invalid_position' };
    }
    return { position: posNum, error: null };
  }

  private calculateRowPoints(
    isParticipation: boolean,
    activityType: string,
    activityDef: ActivityType,
    position: number | null
  ): number {
    return isParticipation
      ? this.serverService.getParticipationPoints(activityType)
      : Math.max(0, activityDef.points - ((position ?? 1) - 1));
  }

  private checkIsExisting(activities: Activity[], userId: string, activityType: string, weekStart: Date): boolean {
    return activities.some(
      a =>
        a.userId === userId && a.activityType === activityType && getWeekStart(a.date).getTime() === weekStart.getTime()
    );
  }

  private buildStatus(row: Omit<ImportRow, 'status'>): ImportRow['status'] {
    if (row.validationError) return 'invalid';
    if (!row.matchedMember) return 'unmatched';
    if (row.isExisting) return 'willUpdate';
    return 'ready';
  }

  protected assignMember(row: ImportRow, member: UserProfile | null): void {
    this.rows.update(rows => {
      const index = rows.indexOf(row);
      if (index === -1) return rows;

      const activities = this.activityService.activities();
      const updated = [...rows];
      const updatedRow = { ...updated[index], matchedMember: member };

      if (member && updatedRow.weekStart && updatedRow.activityType && !updatedRow.validationError) {
        updatedRow.isExisting = activities.some(
          a =>
            a.userId === member.id &&
            a.activityType === updatedRow.activityType &&
            getWeekStart(a.date).getTime() === updatedRow.weekStart!.getTime()
        );
      }

      updated[index] = { ...updatedRow, status: this.buildStatus(updatedRow) };
      return updated;
    });
  }

  protected toggleRowUpdate(row: ImportRow, checked: boolean): void {
    this.rows.update(rows => {
      const index = rows.indexOf(row);
      if (index === -1) return rows;
      const updated = [...rows];
      updated[index] = { ...updated[index], includeUpdate: checked };
      return updated;
    });
  }

  protected toggleUpdateAll(checked: boolean): void {
    this.rows.update(rows =>
      rows.map(r => (r.isExisting && r.matchedMember && !r.validationError ? { ...r, includeUpdate: checked } : r))
    );
  }

  protected async confirmImport(): Promise<void> {
    const toImport = [...this.rowsToInsert(), ...this.rowsToUpdate()].map(r => ({
      userId: r.matchedMember!.id,
      activityType: r.activityType,
      position: r.position,
      points: r.points,
      date: r.weekStart!,
    }));

    if (toImport.length === 0) return;

    this.isImporting.set(true);
    try {
      const { error } = await this.activityService.batchImportActivities(toImport);
      if (error) throw error;

      this.importResult.set({
        inserted: this.rowsToInsert().length,
        updated: this.rowsToUpdate().length,
        skipped: this.skippedRows().length,
      });
      this.step.set('done');
    } catch {
      this.snackbarService.error(this.translate.instant('server.import.result.error'));
    } finally {
      this.isImporting.set(false);
    }
  }

  protected reset(): void {
    this.step.set('upload');
    this.rows.set([]);
    this.activityFilter.set('all');
    this.importResult.set(null);
  }
}
