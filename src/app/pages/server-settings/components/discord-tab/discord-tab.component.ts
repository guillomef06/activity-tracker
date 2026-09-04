import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { FormBuilder, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { DiscordService } from '@app/core/services/discord.service';
import { DiscordScheduledMessageService } from '@app/core/services/discord-scheduled-message.service';
import { SnackbarService } from '@app/core/services';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import { createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';
import type { DiscordWebhook, DiscordScheduledMessage, DiscordScheduleFrequency } from '@app/shared/models';

const MESSAGE_MAX_LENGTH = 2000;
const MIN_DAY_OF_MONTH = 1;
const MAX_DAY_OF_MONTH = 28;
const MIN_HOUR_UTC = 0;
const MAX_HOUR_UTC = 23;
const DEFAULT_HOUR_UTC = 19;
const DEFAULT_DAY_OF_MONTH = 1;
const HOURS_IN_DAY = 24;

/** ISO 8601 day-of-week order (1=Mon ... 7=Sun), matching the `days_of_week` column. */
const WEEK_DAYS: readonly { iso: number; labelKey: string }[] = [
  { iso: 1, labelKey: 'discord.schedule.dayShort.mon' },
  { iso: 2, labelKey: 'discord.schedule.dayShort.tue' },
  { iso: 3, labelKey: 'discord.schedule.dayShort.wed' },
  { iso: 4, labelKey: 'discord.schedule.dayShort.thu' },
  { iso: 5, labelKey: 'discord.schedule.dayShort.fri' },
  { iso: 6, labelKey: 'discord.schedule.dayShort.sat' },
  { iso: 7, labelKey: 'discord.schedule.dayShort.sun' },
];

interface ScheduleViewModel {
  schedule: DiscordScheduledMessage;
  channelName: string;
  summary: string;
}

interface HourOption {
  value: number;
  label: string;
}

/** Formats an hour (0-23) as a zero-padded "HH:00" label, e.g. 9 -> "09:00". */
function formatHourUtc(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

@Component({
  selector: 'app-discord-tab',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatCheckboxModule,
    MatDialogModule,
    TranslateModule,
    LoadingButtonComponent,
  ],
  templateUrl: './discord-tab.component.html',
  styleUrl: './discord-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscordTabComponent implements OnInit {
  private readonly discordService = inject(DiscordService);
  private readonly discordScheduleService = inject(DiscordScheduledMessageService);
  private readonly fb = inject(FormBuilder);
  private readonly nnfb = inject(NonNullableFormBuilder);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly hourOptions: readonly HourOption[] = Array.from({ length: HOURS_IN_DAY }, (_, hour) => ({
    value: hour,
    label: formatHourUtc(hour),
  }));
  protected readonly weekDays = WEEK_DAYS;
  protected readonly minDayOfMonth = MIN_DAY_OF_MONTH;
  protected readonly maxDayOfMonth = MAX_DAY_OF_MONTH;

  protected readonly webhooks = this.discordService.webhooks;
  protected readonly isLoading = signal(false);
  protected readonly isSubmittingWebhook = signal(false);
  protected readonly isUpdatingWebhook = signal(false);
  protected readonly isSendingMessage = signal(false);
  protected readonly editingWebhook = signal<DiscordWebhook | null>(null);
  protected readonly isAddingChannel = signal(false);
  protected readonly selectedWebhookId = signal<string>('');

  protected readonly schedules = this.discordScheduleService.schedules;
  protected readonly isLoadingSchedules = signal(false);
  protected readonly isSubmittingSchedule = signal(false);
  protected readonly isUpdatingSchedule = signal(false);
  protected readonly editingSchedule = signal<DiscordScheduledMessage | null>(null);
  protected readonly isAddingSchedule = signal(false);

  protected readonly scheduleViewModels = computed<ScheduleViewModel[]>(() =>
    this.schedules().map(schedule => ({
      schedule,
      channelName: this.findChannelName(schedule.webhook_id),
      summary: this.buildScheduleSummary(schedule),
    }))
  );

  protected readonly webhookForm: FormGroup = this.fb.group({
    channel_name: ['', [Validators.required, Validators.maxLength(100)]],
    webhook_url: ['', [Validators.required, Validators.pattern(/^https:\/\/discord(app)?\.com\/api\/webhooks\/.+/)]],
    default_message: ['', Validators.maxLength(MESSAGE_MAX_LENGTH)],
  });

  protected readonly messageForm: FormGroup = this.fb.group({
    webhook_id: ['', Validators.required],
    content: ['', [Validators.required, Validators.maxLength(MESSAGE_MAX_LENGTH)]],
  });

  protected readonly scheduleForm = this.nnfb.group({
    webhook_id: this.nnfb.control('', Validators.required),
    message: this.nnfb.control('', [Validators.required, Validators.maxLength(MESSAGE_MAX_LENGTH)]),
    frequency: this.nnfb.control<DiscordScheduleFrequency>('daily', Validators.required),
    days_of_week: this.nnfb.array(WEEK_DAYS.map(() => this.nnfb.control(false))),
    day_of_month: this.nnfb.control(DEFAULT_DAY_OF_MONTH, [
      Validators.min(MIN_DAY_OF_MONTH),
      Validators.max(MAX_DAY_OF_MONTH),
    ]),
    hour_utc: this.nnfb.control(DEFAULT_HOUR_UTC, [
      Validators.required,
      Validators.min(MIN_HOUR_UTC),
      Validators.max(MAX_HOUR_UTC),
    ]),
  });

  protected readonly channelNameError = createFieldErrorSignal(this.webhookForm, 'channel_name', this.destroyRef);
  protected readonly webhookUrlError = createFieldErrorSignal(
    this.webhookForm,
    'webhook_url',
    this.destroyRef,
    undefined,
    {
      pattern: 'discord.errors.invalidWebhookUrl',
    }
  );
  protected readonly messageContentError = createFieldErrorSignal(this.messageForm, 'content', this.destroyRef);
  protected readonly scheduleMessageError = createFieldErrorSignal(this.scheduleForm, 'message', this.destroyRef);
  protected readonly scheduleDayOfMonthError = createFieldErrorSignal(
    this.scheduleForm,
    'day_of_month',
    this.destroyRef
  );

  /**
   * Plain getter (not a signal) — mirrors the built-in `form.invalid` pattern already used
   * in this component's template, since it derives from the reactive form's own live state
   * rather than from a signal, and OnPush re-checks this component on every form input event.
   */
  protected get isScheduleFormValid(): boolean {
    if (this.scheduleForm.invalid) return false;
    if (this.scheduleForm.controls.frequency.value === 'weekly') {
      return this.scheduleForm.controls.days_of_week.controls.some(control => control.value);
    }
    return true;
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadWebhooks(), this.loadSchedules()]);
  }

  private async loadWebhooks(): Promise<void> {
    this.isLoading.set(true);
    try {
      const { error } = await this.discordService.loadWebhooks();
      if (error) throw error;
    } catch (error) {
      console.error('Error loading discord webhooks:', error);
      this.snackbarService.error(this.translate.instant('discord.loadFailed'));
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadSchedules(): Promise<void> {
    this.isLoadingSchedules.set(true);
    try {
      const { error } = await this.discordScheduleService.loadSchedules();
      if (error) throw error;
    } catch (error) {
      console.error('Error loading discord scheduled messages:', error);
      this.snackbarService.error(this.translate.instant('discord.schedule.loadFailed'));
    } finally {
      this.isLoadingSchedules.set(false);
    }
  }

  protected startAdd(): void {
    this.editingWebhook.set(null);
    this.isAddingChannel.set(true);
    this.webhookForm.reset({ channel_name: '', webhook_url: '', default_message: '' });
  }

  protected closeForm(): void {
    this.isAddingChannel.set(false);
    this.editingWebhook.set(null);
    this.webhookForm.reset({ channel_name: '', webhook_url: '', default_message: '' });
  }

  protected async handleFormSubmit(): Promise<void> {
    if (this.editingWebhook()) {
      await this.saveEdit();
    } else {
      await this.addWebhook();
    }
  }

  protected async addWebhook(): Promise<void> {
    if (this.webhookForm.invalid) return;

    this.isSubmittingWebhook.set(true);
    try {
      const { error } = await this.discordService.createWebhook({
        channel_name: this.webhookForm.value.channel_name.trim(),
        webhook_url: this.webhookForm.value.webhook_url.trim(),
        default_message: this.webhookForm.value.default_message?.trim() || null,
      });
      if (error) throw error;

      this.snackbarService.success(this.translate.instant('discord.channelAdded'));
      this.closeForm();
    } catch (error) {
      console.error('Error adding webhook:', error);
      this.snackbarService.error(this.translate.instant('discord.channelAddFailed'));
    } finally {
      this.isSubmittingWebhook.set(false);
    }
  }

  protected startEdit(webhook: DiscordWebhook): void {
    this.isAddingChannel.set(false);
    this.editingWebhook.set(webhook);
    this.webhookForm.patchValue({
      channel_name: webhook.channel_name,
      webhook_url: webhook.webhook_url,
      default_message: webhook.default_message ?? '',
    });
  }

  protected async saveEdit(): Promise<void> {
    const webhook = this.editingWebhook();
    if (this.webhookForm.invalid || !webhook) return;

    this.isUpdatingWebhook.set(true);
    try {
      const { error } = await this.discordService.updateWebhook(webhook.id, {
        channel_name: this.webhookForm.value.channel_name.trim(),
        default_message: this.webhookForm.value.default_message?.trim() || null,
      });
      if (error) throw error;

      this.snackbarService.success(this.translate.instant('discord.channelUpdated'));
      this.closeForm();
    } catch (error) {
      console.error('Error updating webhook:', error);
      this.snackbarService.error(this.translate.instant('discord.channelUpdateFailed'));
    } finally {
      this.isUpdatingWebhook.set(false);
    }
  }

  protected quickSend(webhook: DiscordWebhook): void {
    this.messageForm.patchValue({ webhook_id: webhook.id });
    this.onChannelSelected(webhook.id);
  }

  protected async deleteWebhook(webhook: DiscordWebhook): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: { message: this.translate.instant('discord.deleteConfirm', { name: webhook.channel_name }) },
        })
        .afterClosed()
    );

    if (!confirmed) return;

    try {
      const { error } = await this.discordService.deleteWebhook(webhook.id);
      if (error) throw error;

      this.snackbarService.success(this.translate.instant('discord.channelDeleted'));

      if (this.editingWebhook()?.id === webhook.id) {
        this.closeForm();
      }
      if (this.selectedWebhookId() === webhook.id) {
        this.selectedWebhookId.set('');
        this.messageForm.patchValue({ webhook_id: '', content: '' });
      }
    } catch (error) {
      console.error('Error deleting webhook:', error);
      this.snackbarService.error(this.translate.instant('discord.channelDeleteFailed'));
    }
  }

  protected onChannelSelected(webhookId: string): void {
    this.selectedWebhookId.set(webhookId);
    const webhook = this.webhooks().find(w => w.id === webhookId);
    if (webhook?.default_message) {
      this.messageForm.patchValue({ content: webhook.default_message });
      this.messageForm.get('content')?.markAsDirty();
    } else {
      this.messageForm.patchValue({ content: '' });
    }
  }

  protected async sendMessage(): Promise<void> {
    if (this.messageForm.invalid) return;

    const { webhook_id, content } = this.messageForm.value as { webhook_id: string; content: string };
    const webhook = this.webhooks().find(w => w.id === webhook_id);
    if (!webhook) return;

    this.isSendingMessage.set(true);
    try {
      const { error } = await this.discordService.sendMessage(webhook.webhook_url, content.trim());
      if (error) throw error;

      this.snackbarService.success(this.translate.instant('discord.messageSent'));
      this.messageForm.patchValue({ content: webhook.default_message ?? '' });
      this.messageForm.get('content')?.markAsPristine();
    } catch (error) {
      console.error('Error sending discord message:', error);
      this.snackbarService.error(this.translate.instant('discord.messageSendFailed'));
    } finally {
      this.isSendingMessage.set(false);
    }
  }

  protected startAddSchedule(): void {
    this.editingSchedule.set(null);
    this.isAddingSchedule.set(true);
    this.resetScheduleForm();
  }

  protected closeScheduleForm(): void {
    this.isAddingSchedule.set(false);
    this.editingSchedule.set(null);
    this.resetScheduleForm();
  }

  private resetScheduleForm(): void {
    this.scheduleForm.reset({
      webhook_id: '',
      message: '',
      frequency: 'daily',
      day_of_month: DEFAULT_DAY_OF_MONTH,
      hour_utc: DEFAULT_HOUR_UTC,
    });
    this.scheduleForm.controls.days_of_week.controls.forEach(control => control.setValue(false));
  }

  protected startEditSchedule(schedule: DiscordScheduledMessage): void {
    this.isAddingSchedule.set(false);
    this.editingSchedule.set(schedule);
    this.scheduleForm.patchValue({
      webhook_id: schedule.webhook_id,
      message: schedule.message,
      frequency: schedule.frequency,
      day_of_month: schedule.day_of_month ?? DEFAULT_DAY_OF_MONTH,
      hour_utc: schedule.hour_utc,
    });
    const selectedDays = new Set(schedule.days_of_week ?? []);
    this.scheduleForm.controls.days_of_week.controls.forEach((control, index) => {
      control.setValue(selectedDays.has(WEEK_DAYS[index].iso));
    });
  }

  protected async handleScheduleFormSubmit(): Promise<void> {
    if (this.editingSchedule()) {
      await this.saveScheduleEdit();
    } else {
      await this.addSchedule();
    }
  }

  protected async addSchedule(): Promise<void> {
    if (!this.isScheduleFormValid) return;

    this.isSubmittingSchedule.set(true);
    try {
      const { error } = await this.discordScheduleService.createSchedule(this.buildScheduleRequest());
      if (error) throw error;

      this.snackbarService.success(this.translate.instant('discord.schedule.created'));
      this.closeScheduleForm();
    } catch (error) {
      console.error('Error creating discord scheduled message:', error);
      this.snackbarService.error(this.translate.instant('discord.schedule.createFailed'));
    } finally {
      this.isSubmittingSchedule.set(false);
    }
  }

  protected async saveScheduleEdit(): Promise<void> {
    const schedule = this.editingSchedule();
    if (!this.isScheduleFormValid || !schedule) return;

    this.isUpdatingSchedule.set(true);
    try {
      const { error } = await this.discordScheduleService.updateSchedule(schedule.id, this.buildScheduleRequest());
      if (error) throw error;

      this.snackbarService.success(this.translate.instant('discord.schedule.updated'));
      this.closeScheduleForm();
    } catch (error) {
      console.error('Error updating discord scheduled message:', error);
      this.snackbarService.error(this.translate.instant('discord.schedule.updateFailed'));
    } finally {
      this.isUpdatingSchedule.set(false);
    }
  }

  private buildScheduleRequest(): {
    webhook_id: string;
    message: string;
    frequency: DiscordScheduleFrequency;
    days_of_week: number[] | null;
    day_of_month: number | null;
    hour_utc: number;
  } {
    const value = this.scheduleForm.getRawValue();
    const frequency = value.frequency;

    return {
      webhook_id: value.webhook_id,
      message: value.message.trim(),
      frequency,
      days_of_week:
        frequency === 'weekly' ? WEEK_DAYS.filter((_, index) => value.days_of_week[index]).map(day => day.iso) : null,
      day_of_month: frequency === 'monthly' ? value.day_of_month : null,
      hour_utc: value.hour_utc,
    };
  }

  protected async toggleScheduleActive(schedule: DiscordScheduledMessage): Promise<void> {
    try {
      const { error } = await this.discordScheduleService.toggleActive(schedule.id, !schedule.is_active);
      if (error) throw error;

      this.snackbarService.success(this.translate.instant('discord.schedule.toggled'));
    } catch (error) {
      console.error('Error toggling discord scheduled message:', error);
      this.snackbarService.error(this.translate.instant('discord.schedule.toggleFailed'));
    }
  }

  protected async deleteSchedule(schedule: DiscordScheduledMessage): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: { message: this.translate.instant('discord.schedule.deleteConfirm') },
        })
        .afterClosed()
    );

    if (!confirmed) return;

    try {
      const { error } = await this.discordScheduleService.deleteSchedule(schedule.id);
      if (error) throw error;

      this.snackbarService.success(this.translate.instant('discord.schedule.deleted'));

      if (this.editingSchedule()?.id === schedule.id) {
        this.closeScheduleForm();
      }
    } catch (error) {
      console.error('Error deleting discord scheduled message:', error);
      this.snackbarService.error(this.translate.instant('discord.schedule.deleteFailed'));
    }
  }

  private findChannelName(webhookId: string): string {
    return this.webhooks().find(w => w.id === webhookId)?.channel_name ?? '';
  }

  private buildScheduleSummary(schedule: DiscordScheduledMessage): string {
    const hour = formatHourUtc(schedule.hour_utc);

    if (schedule.frequency === 'daily') {
      return this.translate.instant('discord.schedule.summaryDaily', { hour });
    }

    if (schedule.frequency === 'weekly') {
      const days = WEEK_DAYS.filter(day => schedule.days_of_week?.includes(day.iso))
        .map(day => this.translate.instant(day.labelKey))
        .join(', ');
      return this.translate.instant('discord.schedule.summaryWeekly', { days, hour });
    }

    return this.translate.instant('discord.schedule.summaryMonthly', { day: schedule.day_of_month, hour });
  }
}
