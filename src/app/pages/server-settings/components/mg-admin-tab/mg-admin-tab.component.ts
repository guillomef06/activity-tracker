import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MgEventService } from '@app/core/services/mg-event.service';
import { AuthService } from '@app/core/services/auth.service';
import { ActivityService } from '@app/core/services/activity.service';
import { ServerService } from '@app/core/services/server.service';
import { SnackbarService } from '@app/core/services';
import { buildMgSlotRows } from '@shared/utils/mg-slot.util';
import type {
  MgEvent,
  ServerMgConfig,
  ServerMgSlotConfig,
  UpsertMgSlotConfigRow,
  MgRegistrationWithUser,
  MgSelectionWithUser,
  MgSelectionPayload,
  MgLeaderboardEntry,
} from '@shared/models';

export const targetRangeValidator: ValidatorFn = (group): ValidationErrors | null => {
  const targetMin = group.get('targetMin')?.value;
  const targetMax = group.get('targetMax')?.value;
  return targetMax < targetMin ? { targetRange: true } : null;
};

@Component({
  selector: 'app-mg-admin-tab',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './mg-admin-tab.component.html',
  styleUrl: './mg-admin-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MgAdminTabComponent implements OnInit {
  private readonly mgEventService = inject(MgEventService);
  private readonly authService = inject(AuthService);
  private readonly activityService = inject(ActivityService);
  private readonly serverService = inject(ServerService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);

  protected readonly isLoading = signal(false);
  protected readonly isSavingConfig = signal(false);
  protected readonly isSavingSlotConfig = signal(false);
  protected readonly isGenerating = signal(false);
  protected readonly isPublishing = signal(false);

  protected readonly mgEvent = signal<MgEvent | null>(null);
  protected readonly serverConfig = signal<ServerMgConfig | null>(null);
  protected readonly slotConfig = signal<ServerMgSlotConfig[]>([]);
  protected readonly registrations = signal<MgRegistrationWithUser[]>([]);
  protected readonly currentSelection = signal<MgSelectionWithUser[]>([]);
  protected readonly previewPayloads = signal<MgSelectionPayload[]>([]);
  protected readonly showPreview = signal(false);

  protected readonly configForm: FormGroup = this.fb.group({
    capacity: [10, Validators.required],
    assignment_mode: ['automatic', Validators.required],
    dkp_enabled: [false, Validators.required],
  });

  protected readonly slotConfigForm: FormGroup = this.fb.group({
    rows: this.fb.array<FormGroup>([]),
  });

  protected get slotRows(): FormGroup[] {
    return (this.slotConfigForm.get('rows') as FormArray).controls as FormGroup[];
  }

  protected readonly isAutoMode = computed(() => this.configForm.get('assignment_mode')?.value === 'automatic');

  protected readonly canPublish = computed(() => {
    const ev = this.mgEvent();
    return ev !== null && (ev.status === 'registration_closed' || ev.status === 'selection_published');
  });

  protected readonly isLocked = computed(() => {
    const ev = this.mgEvent();
    return ev?.status === 'ongoing' || ev?.status === 'finished';
  });

  protected readonly selectedPlayers = computed(() =>
    this.currentSelection().filter(s => s.selection_type === 'selected')
  );

  protected readonly ffaCount = computed(() => this.currentSelection().filter(s => s.selection_type === 'ffa').length);

  async ngOnInit(): Promise<void> {
    const serverId = this.authService.getServerId();
    if (!serverId) return;

    this.isLoading.set(true);
    try {
      const [event, config, slotConfig] = await Promise.all([
        this.mgEventService.loadCurrentEvent(serverId),
        this.mgEventService.loadServerConfig(serverId),
        this.mgEventService.loadSlotConfig(serverId),
      ]);

      this.mgEvent.set(event);
      this.serverConfig.set(config);
      this.slotConfig.set(slotConfig);

      if (config) {
        this.configForm.patchValue({
          capacity: config.capacity,
          assignment_mode: config.assignment_mode,
          dkp_enabled: config.dkp_enabled,
        });
      }

      this.rebuildSlotConfigForm(slotConfig);

      if (event) {
        const [regs, sel] = await Promise.all([
          this.mgEventService.loadRegistrations(event.id),
          this.mgEventService.loadSelection(event.id),
        ]);
        this.registrations.set(regs);
        this.currentSelection.set(sel);
      }

      await this.activityService.initialize();
    } catch (error) {
      console.error('Error loading MG admin data:', error);
      this.snackbarService.error(this.translate.instant('mg.admin.loadError'));
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async saveConfig(): Promise<void> {
    if (this.configForm.invalid) return;
    const serverId = this.authService.getServerId();
    if (!serverId) return;

    this.isSavingConfig.set(true);
    try {
      const { error } = await this.mgEventService.saveServerConfig(serverId, this.configForm.value);
      if (error) throw error;
      this.snackbarService.success(this.translate.instant('mg.admin.configSaved'));
      const config = await this.mgEventService.loadServerConfig(serverId);
      this.serverConfig.set(config);
    } catch {
      this.snackbarService.error(this.translate.instant('mg.admin.configSaveError'));
    } finally {
      this.isSavingConfig.set(false);
    }
  }

  private rebuildSlotConfigForm(config: readonly ServerMgSlotConfig[]): void {
    const rows = buildMgSlotRows(config);
    const rowsArray = this.fb.array<FormGroup>(
      rows.map(row =>
        this.fb.group(
          {
            slotOrder: [row.slotOrder],
            rankLabel: [row.rankLabel],
            medal: [row.medal],
            cost: [row.cost, [Validators.required, Validators.min(0)]],
            targetMin: [row.targetMin, [Validators.required, Validators.min(0)]],
            targetMax: [row.targetMax, [Validators.required, Validators.min(0)]],
          },
          { validators: targetRangeValidator }
        )
      )
    );
    this.slotConfigForm.setControl('rows', rowsArray);
  }

  protected async saveSlotConfig(): Promise<void> {
    if (this.slotConfigForm.invalid) return;
    const serverId = this.authService.getServerId();
    if (!serverId) return;

    this.isSavingSlotConfig.set(true);
    try {
      const rows: UpsertMgSlotConfigRow[] = this.slotRows.map(row => ({
        slot_order: row.get('slotOrder')?.value,
        cost: row.get('cost')?.value,
        target_min: row.get('targetMin')?.value,
        target_max: row.get('targetMax')?.value,
      }));
      const { error } = await this.mgEventService.saveSlotConfig(serverId, rows);
      if (error) throw error;
      this.snackbarService.success(this.translate.instant('mg.admin.slotConfigSaved'));
      const slotConfig = await this.mgEventService.loadSlotConfig(serverId);
      this.slotConfig.set(slotConfig);
    } catch {
      this.snackbarService.error(this.translate.instant('mg.admin.slotConfigSaveError'));
    } finally {
      this.isSavingSlotConfig.set(false);
    }
  }

  protected generatePreview(): void {
    const event = this.mgEvent();
    const config = this.serverConfig() ?? { capacity: this.configForm.value.capacity };
    if (!event) return;

    const scores: MgLeaderboardEntry[] = this.activityService.getUserScores().map(us => ({
      user_id: us.userId,
      display_name: us.displayName,
      total_points: us.sixWeekTotal,
    }));

    const payloads = this.mgEventService.generateAutoSelectionPayload(
      event.id,
      this.registrations().map(r => ({
        id: r.id,
        mg_event_id: r.mg_event_id,
        user_id: r.user_id,
        registered_at: r.registered_at,
      })),
      scores,
      config.capacity,
      buildMgSlotRows(this.slotConfig())
    );

    this.previewPayloads.set(payloads);
    this.showPreview.set(true);
  }

  protected async confirmAutoSelection(): Promise<void> {
    const event = this.mgEvent();
    if (!event) return;

    this.isGenerating.set(true);
    try {
      const { error } = await this.mgEventService.saveSelection(event.id, this.previewPayloads());
      if (error) throw error;
      const sel = await this.mgEventService.loadSelection(event.id);
      this.currentSelection.set(sel);
      this.showPreview.set(false);
      this.snackbarService.success(this.translate.instant('mg.admin.selectionSaved'));
    } catch {
      this.snackbarService.error(this.translate.instant('mg.admin.selectionSaveError'));
    } finally {
      this.isGenerating.set(false);
    }
  }

  protected cancelPreview(): void {
    this.showPreview.set(false);
    this.previewPayloads.set([]);
  }

  protected async publishSelection(): Promise<void> {
    const event = this.mgEvent();
    if (!event) return;

    this.isPublishing.set(true);
    try {
      const { error } = await this.mgEventService.publishSelection(event.id);
      if (error) throw error;
      const updated = await this.mgEventService.loadCurrentEvent(this.authService.getServerId()!);
      this.mgEvent.set(updated);
      this.snackbarService.success(this.translate.instant('mg.admin.selectionPublished'));
    } catch {
      this.snackbarService.error(this.translate.instant('mg.admin.publishError'));
    } finally {
      this.isPublishing.set(false);
    }
  }

  trackBySlotRow(_: number, row: FormGroup): number {
    return row.get('slotOrder')?.value;
  }

  trackByReg(_: number, reg: MgRegistrationWithUser): string {
    return reg.id;
  }

  trackBySel(_: number, sel: MgSelectionWithUser): string {
    return sel.id;
  }

  trackByPayload(_: number, p: MgSelectionPayload): number {
    return p.rank;
  }

  protected getDisplayName(userId: string | null): string {
    if (!userId) return '';
    const reg = this.registrations().find(r => r.user_id === userId);
    return reg?.user_profiles.display_name ?? userId;
  }
}
