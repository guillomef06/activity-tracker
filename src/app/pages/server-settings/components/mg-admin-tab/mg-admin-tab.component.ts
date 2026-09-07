import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { form, required, min, validate, applyEach, FormField } from '@angular/forms/signals';
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
import { buildMgSlotRows, MgSlotRow } from '@shared/utils/mg-slot.util';
import { MG_SLOT_DEFAULTS } from '@shared/constants/mg-slots.constant';
import type {
  MgEvent,
  ServerMgConfig,
  ServerMgSlotConfig,
  MgAssignmentMode,
  UpsertMgSlotConfigRow,
  MgRegistrationWithUser,
  MgSelectionWithUser,
  MgSelectionPayload,
  MgLeaderboardEntry,
} from '@shared/models';

const MIN_SLOT_VALUE = 0;
const DEFAULT_CAPACITY: MgEventCapacity = 10;
const DEFAULT_ASSIGNMENT_MODE: MgAssignmentMode = 'automatic';

type MgEventCapacity = ServerMgConfig['capacity'];

interface ConfigFormModel {
  capacity: MgEventCapacity;
  assignment_mode: MgAssignmentMode;
  dkp_enabled: boolean;
}

interface SlotConfigFormModel {
  rows: MgSlotRow[];
}

/** A registration row enriched with its precomputed desired-position rank label. */
interface MgRegistrationRow extends MgRegistrationWithUser {
  positionLabel: string | null;
}

@Component({
  selector: 'app-mg-admin-tab',
  imports: [
    DatePipe,
    FormField,
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

  protected readonly configModel = signal<ConfigFormModel>({
    capacity: DEFAULT_CAPACITY,
    assignment_mode: DEFAULT_ASSIGNMENT_MODE,
    dkp_enabled: false,
  });

  protected readonly slotConfigModel = signal<SlotConfigFormModel>({ rows: [] });

  protected readonly configForm = form(this.configModel, path => {
    required(path.capacity);
    required(path.assignment_mode);
  });

  protected readonly slotConfigForm = form(this.slotConfigModel, path => {
    applyEach(path.rows, row => {
      required(row.cost);
      min(row.cost, MIN_SLOT_VALUE);
      required(row.targetMin);
      min(row.targetMin, MIN_SLOT_VALUE);
      required(row.targetMax);
      min(row.targetMax, MIN_SLOT_VALUE);
      validate(row.targetMax, ({ value, valueOf }) =>
        value() < valueOf(row.targetMin) ? { kind: 'targetRange' } : null
      );
    });
  });

  protected get slotRows(): MgSlotRow[] {
    return this.slotConfigModel().rows;
  }

  protected readonly isAutoMode = computed(() => this.configModel().assignment_mode === 'automatic');

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

  /**
   * Registrations enriched with a precomputed rank label, so the template never needs to
   * call a method (project convention: no function calls in templates). `positionLabel` is
   * null for pre-existing registrations that predate desired_slot_order (see
   * supabase/41-mg-registration-position-comment.sql) — the template falls back gracefully.
   */
  protected readonly registrationRows = computed<MgRegistrationRow[]>(() =>
    this.registrations().map(reg => ({
      ...reg,
      positionLabel: MG_SLOT_DEFAULTS.find(slot => slot.slotOrder === reg.desired_slot_order)?.rankLabel ?? null,
    }))
  );

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
        this.configModel.set({
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
    if (this.configForm().invalid()) {
      this.configForm().markAsTouched();
      return;
    }
    const serverId = this.authService.getServerId();
    if (!serverId) return;

    this.isSavingConfig.set(true);
    try {
      const { error } = await this.mgEventService.saveServerConfig(serverId, this.configModel());
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
    this.slotConfigModel.set({ rows: buildMgSlotRows(config) });
  }

  protected async saveSlotConfig(): Promise<void> {
    if (this.slotConfigForm().invalid()) {
      this.slotConfigForm().markAsTouched();
      return;
    }
    const serverId = this.authService.getServerId();
    if (!serverId) return;

    this.isSavingSlotConfig.set(true);
    try {
      const rows: UpsertMgSlotConfigRow[] = this.slotRows.map(row => ({
        slot_order: row.slotOrder,
        cost: row.cost,
        target_min: row.targetMin,
        target_max: row.targetMax,
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
    const config = this.serverConfig() ?? { capacity: this.configModel().capacity };
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
        desired_slot_order: r.desired_slot_order,
        comment: r.comment,
      })),
      scores,
      config.capacity,
      this.slotRows
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

    const serverId = this.authService.getServerId();
    if (!serverId) return;

    this.isPublishing.set(true);
    try {
      const { error } = await this.mgEventService.publishSelection(event.id);
      if (error) throw error;
      const updated = await this.mgEventService.loadCurrentEvent(serverId);
      this.mgEvent.set(updated);
      this.snackbarService.success(this.translate.instant('mg.admin.selectionPublished'));
    } catch {
      this.snackbarService.error(this.translate.instant('mg.admin.publishError'));
    } finally {
      this.isPublishing.set(false);
    }
  }

  trackByReg(_: number, reg: MgRegistrationRow): string {
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
