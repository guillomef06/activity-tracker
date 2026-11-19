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
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MgEventService } from '@app/core/services/mg-event.service';
import { AuthService } from '@app/core/services/auth.service';
import { ActivityService } from '@app/core/services/activity.service';
import { ServerService } from '@app/core/services/server.service';
import { SnackbarService } from '@app/core/services';
import { buildMgSlotRows, MgSlotRow } from '@shared/utils/mg-slot.util';
import { MG_SLOT_DEFAULTS } from '@shared/constants/mg-slots.constant';
import {
  MgSelectionPanelComponent,
  type MgMemberOption,
  type MgSelectionPanelKind,
} from './components/mg-selection-panel/mg-selection-panel.component';
import type {
  MgEvent,
  ServerMgConfig,
  ServerMgSlotConfig,
  MgAssignmentMode,
  UpsertMgSlotConfigRow,
  MgRegistrationWithUser,
  MgSelectionWithUser,
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

function isSameSlotRow(a: MgSlotRow, b: MgSlotRow | undefined): boolean {
  return !!b && a.cost === b.cost && a.targetMin === b.targetMin && a.targetMax === b.targetMax;
}

/** A registration row enriched with its precomputed desired-position rank label and total score. */
interface MgRegistrationRow extends MgRegistrationWithUser {
  positionLabel: string | null;
  totalScore: number | null;
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
    MatChipsModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    TranslateModule,
    MgSelectionPanelComponent,
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
  protected readonly isSavingSettings = signal(false);

  protected readonly mgEvent = signal<MgEvent | null>(null);
  protected readonly serverConfig = signal<ServerMgConfig | null>(null);
  protected readonly slotConfig = signal<ServerMgSlotConfig[]>([]);
  protected readonly registrations = signal<MgRegistrationWithUser[]>([]);
  protected readonly currentSelection = signal<MgSelectionWithUser[]>([]);
  protected readonly lastFinishedEvent = signal<MgEvent | null>(null);
  protected readonly lastFinishedRegistrations = signal<MgRegistrationWithUser[]>([]);
  protected readonly lastFinishedSelection = signal<MgSelectionWithUser[]>([]);

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

  /** Saved (not in-progress-form) slot rows: the prices a selection is snapshotted with. */
  protected readonly savedSlotRows = computed(() => buildMgSlotRows(this.slotConfig()));

  /** Selection settings come from the saved server config, not the (possibly unsaved) config form. */
  protected readonly savedCapacity = computed(() => this.serverConfig()?.capacity ?? DEFAULT_CAPACITY);
  protected readonly savedAssignmentMode = computed(
    () => this.serverConfig()?.assignment_mode ?? DEFAULT_ASSIGNMENT_MODE
  );
  protected readonly savedDkpEnabled = computed(() => this.serverConfig()?.dkp_enabled ?? false);

  /** Published or running events are frozen; only a finished one can be corrected (see lastFinishedEvent). */
  protected readonly currentPanelKind = computed<MgSelectionPanelKind>(() => {
    const status = this.mgEvent()?.status;
    return status === 'selection_published' || status === 'ongoing' ? 'locked' : 'draft';
  });

  /** userId -> current leaderboard total score, for enriching registrationRows below. */
  protected readonly totalScoreByUserId = computed<Map<string, number>>(
    () => new Map(this.activityService.getUserScores().map(us => [us.userId, us.totalScore]))
  );

  /** Every server member, so a correction can record a player who played without registering. */
  protected readonly memberOptions = computed<MgMemberOption[]>(() =>
    this.serverService.members().map(member => ({ userId: member.id, displayName: member.display_name }))
  );

  /** The Registrations list is only useful once the selection is locked: in draft, the pool is the list. */
  protected readonly registrationCount = computed(() => this.registrations().length);
  protected readonly showRegistrationsList = computed(
    () => this.currentPanelKind() === 'locked' && this.registrationCount() > 0
  );

  /** Dirty = the form differs from the SAVED values (defaults when nothing is saved yet). */
  protected readonly configDirty = computed(() => {
    const model = this.configModel();
    return (
      model.capacity !== this.savedCapacity() ||
      model.assignment_mode !== this.savedAssignmentMode() ||
      model.dkp_enabled !== this.savedDkpEnabled()
    );
  });
  protected readonly slotDirty = computed(() => {
    const saved = this.savedSlotRows();
    return this.slotConfigModel().rows.some((row, index) => !isSameSlotRow(row, saved[index]));
  });
  protected readonly settingsDirty = computed(() => this.configDirty() || this.slotDirty());
  protected readonly canSaveSettings = computed(
    () => this.settingsDirty() && this.configForm().valid() && this.slotConfigForm().valid() && !this.isSavingSettings()
  );

  /**
   * Registrations enriched with a precomputed rank label and total score, so the template
   * never needs to call a method (project convention: no function calls in templates).
   * `positionLabel` is null for pre-existing registrations that predate desired_slot_order
   * (see supabase/41-mg-registration-position-comment.sql) — the template falls back
   * gracefully. `totalScore` is null when the user has no activity in the current scoring
   * window (buildUserScores only includes users with recorded activities).
   */
  protected readonly registrationRows = computed<MgRegistrationRow[]>(() =>
    this.registrations().map(reg => ({
      ...reg,
      positionLabel: MG_SLOT_DEFAULTS.find(slot => slot.slotOrder === reg.desired_slot_order)?.rankLabel ?? null,
      totalScore: this.totalScoreByUserId().get(reg.user_id) ?? null,
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

      await Promise.all([this.loadEventData(event), this.loadLastFinishedData(serverId)]);

      await this.activityService.initialize();
    } catch (error) {
      console.error('Error loading MG admin data:', error);
      this.snackbarService.error(this.translate.instant('mg.admin.loadError'));
    } finally {
      this.isLoading.set(false);
    }
  }

  private rebuildSlotConfigForm(config: readonly ServerMgSlotConfig[]): void {
    this.slotConfigModel.set({ rows: buildMgSlotRows(config) });
  }

  /** One Save for both settings blocks: only the blocks that changed are written, in parallel. */
  protected async saveSettings(): Promise<void> {
    if (this.configForm().invalid() || this.slotConfigForm().invalid()) {
      this.configForm().markAsTouched();
      this.slotConfigForm().markAsTouched();
      return;
    }
    const serverId = this.authService.getServerId();
    if (!serverId) return;

    const saveConfig = this.configDirty();
    const saveSlots = this.slotDirty();
    if (!saveConfig && !saveSlots) return;

    this.isSavingSettings.set(true);
    try {
      const [configSaved, slotsSaved] = await Promise.all([
        saveConfig ? this.persistConfig(serverId) : true,
        saveSlots ? this.persistSlotConfig(serverId) : true,
      ]);
      this.notifySettingsResult(configSaved, slotsSaved);
    } finally {
      this.isSavingSettings.set(false);
    }
  }

  /** Resolves true when the write succeeded; the form is kept as is (never rebuilt) so no edit is lost. */
  private async persistConfig(serverId: string): Promise<boolean> {
    try {
      const { error } = await this.mgEventService.saveServerConfig(serverId, this.configModel());
      if (error) throw error;
    } catch (error) {
      console.error('Error saving MG server config:', error);
      return false;
    }
    try {
      this.serverConfig.set(await this.mgEventService.loadServerConfig(serverId));
    } catch (error) {
      console.error('Error reloading MG server config:', error);
    }
    return true;
  }

  private async persistSlotConfig(serverId: string): Promise<boolean> {
    try {
      const rows: UpsertMgSlotConfigRow[] = this.slotRows.map(row => ({
        slot_order: row.slotOrder,
        cost: row.cost,
        target_min: row.targetMin,
        target_max: row.targetMax,
      }));
      const { error } = await this.mgEventService.saveSlotConfig(serverId, rows);
      if (error) throw error;
    } catch (error) {
      console.error('Error saving MG slot config:', error);
      return false;
    }
    try {
      this.slotConfig.set(await this.mgEventService.loadSlotConfig(serverId));
    } catch (error) {
      console.error('Error reloading MG slot config:', error);
    }
    return true;
  }

  private notifySettingsResult(configSaved: boolean, slotsSaved: boolean): void {
    if (configSaved && slotsSaved) {
      this.snackbarService.success(this.translate.instant('mg.admin.settings.saved'));
      return;
    }
    const errors = [
      configSaved ? null : this.translate.instant('mg.admin.configSaveError'),
      slotsSaved ? null : this.translate.instant('mg.admin.slotConfigSaveError'),
    ].filter(message => message !== null);
    this.snackbarService.error(errors.join(' '));
  }

  private async loadEventData(event: MgEvent | null): Promise<void> {
    if (!event) return;
    const [regs, sel] = await Promise.all([
      this.mgEventService.loadRegistrations(event.id),
      this.mgEventService.loadSelection(event.id),
    ]);
    this.registrations.set(regs);
    this.currentSelection.set(sel);
  }

  private async loadLastFinishedData(serverId: string): Promise<void> {
    const finished = await this.mgEventService.loadLastFinishedEvent(serverId);
    this.lastFinishedEvent.set(finished);
    if (!finished) return;
    const [regs, sel] = await Promise.all([
      this.mgEventService.loadRegistrations(finished.id),
      this.mgEventService.loadSelection(finished.id),
    ]);
    this.lastFinishedRegistrations.set(regs);
    this.lastFinishedSelection.set(sel);
  }

  protected async reloadCurrentSelection(): Promise<void> {
    const event = this.mgEvent();
    if (!event) return;
    this.currentSelection.set(await this.mgEventService.loadSelection(event.id));
  }

  protected async reloadLastFinishedSelection(): Promise<void> {
    const finished = this.lastFinishedEvent();
    if (!finished) return;
    this.lastFinishedSelection.set(await this.mgEventService.loadSelection(finished.id));
  }

  protected async reloadCurrentEvent(): Promise<void> {
    const serverId = this.authService.getServerId();
    if (!serverId) return;
    this.mgEvent.set(await this.mgEventService.loadCurrentEvent(serverId));
  }
}
