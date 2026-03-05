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
import { AllianceService } from '@app/core/services/alliance.service';
import { APP_CONSTANTS, ActivityType } from '@app/shared/constants/constants';
import { getWeekStart } from '@app/shared/utils/date.util';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import type { UserProfile } from '@app/shared/models';

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
  private readonly allianceService = inject(AllianceService);
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

    // Reference sheet — valid activity type values
    const refHeaders = ['activity_type', 'default_points', 'available_cycle_weeks'];
    const refRows = this.activityTypes.map((t: ActivityType) => [t.value, t.points, t.availableWeeks.join(', ')]);
    const wsRef = XLSX.utils.aoa_to_sheet([refHeaders, ...refRows]);
    wsRef['!cols'] = [{ wch: 25 }, { wch: 16 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsRef, 'Reference');

    XLSX.writeFile(wb, 'activity-import-template.xlsx');
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
      .map((r, i) => {
        const rawPlayerName = String(r['player_name'] ?? '').trim();
        const activityType = String(r['activity_type'] ?? '')
          .trim()
          .toLowerCase();
        const rawPosition = String(r['position'] ?? '').trim();
        const rawEventDate = String(r['event_date'] ?? '').trim();

        // Match player
        const matchedMember =
          members.find(
            m =>
              m.display_name.toLowerCase() === rawPlayerName.toLowerCase() ||
              m.username.toLowerCase() === rawPlayerName.toLowerCase()
          ) ?? null;

        // Validate activity type
        const activityDef = APP_CONSTANTS.ACTIVITY_TYPES.find((t: ActivityType) => t.value === activityType);
        const activityEnabled = activityDef ? this.allianceService.isActivityEnabled(activityType) : false;

        // Parse date (SheetJS returns Date objects when cellDates: true)
        let eventDate: Date | null = null;
        const rawDate = r['event_date'];
        if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
          eventDate = rawDate;
        } else if (typeof rawDate === 'string' && rawDate.trim()) {
          const parsed = new Date(rawDate.trim());
          if (!isNaN(parsed.getTime())) eventDate = parsed;
        } else if (typeof rawDate === 'number') {
          // Excel date serial fallback
          const parsed = XLSX.SSF.parse_date_code(rawDate);
          if (parsed) {
            eventDate = new Date(parsed.y, parsed.m - 1, parsed.d);
          }
        }

        const weekStart = eventDate ? getWeekStart(eventDate) : null;

        // Validation
        let validationError: string | null = null;
        if (!activityDef) {
          validationError = 'invalid_activity';
        } else if (!activityEnabled) {
          validationError = 'disabled_activity';
        } else if (!eventDate) {
          validationError = 'invalid_date';
        }

        // Participation / position
        const isParticipation = activityDef ? this.allianceService.isParticipationMode(activityType) : false;
        let position: number | null = null;
        if (!isParticipation && !validationError) {
          const posNum = typeof r['position'] === 'number' ? r['position'] : parseInt(rawPosition, 10);
          if (isNaN(posNum) || posNum < 1) {
            validationError = 'invalid_position';
          } else {
            position = posNum;
          }
        }

        // Points
        let points = 0;
        if (activityDef && !validationError) {
          points = isParticipation
            ? this.allianceService.getParticipationPoints(activityType)
            : Math.max(0, activityDef.points - ((position ?? 1) - 1));
        }

        // Week display
        const weeksAgo: number | null = weekStart
          ? Math.round((currentWeekStart.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
          : null;

        // Existing entry detection
        let isExisting = false;
        if (matchedMember && weekStart && activityDef && !validationError) {
          isExisting = activities.some(
            a =>
              a.userId === matchedMember.id &&
              a.activityType === activityType &&
              getWeekStart(a.date).getTime() === weekStart.getTime()
          );
        }

        const row: Omit<ImportRow, 'status'> = {
          rowIndex: i,
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
      });

    this.rows.set(rows);
    this.step.set('preview');
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
      this.snackbarService.error(this.translate.instant('alliance.import.result.error'));
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
