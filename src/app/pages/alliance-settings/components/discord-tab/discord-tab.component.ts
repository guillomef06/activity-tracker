import { Component, inject, signal, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { DiscordService } from '@app/core/services/discord.service';
import { SnackbarService } from '@app/core/services';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import { createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';
import type { DiscordWebhook } from '@app/shared/models';

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
    MatTableModule,
    MatTooltipModule,
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
  private readonly fb = inject(FormBuilder);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly webhooks = this.discordService.webhooks;
  protected readonly isLoading = signal(false);
  protected readonly isSubmittingWebhook = signal(false);
  protected readonly isUpdatingWebhook = signal(false);
  protected readonly isSendingMessage = signal(false);
  protected readonly editingWebhook = signal<DiscordWebhook | null>(null);
  protected readonly isAddingChannel = signal(false);
  protected readonly selectedWebhookId = signal<string>('');
  protected readonly webhookColumns: string[] = ['channelName', 'actions'];

  protected readonly webhookForm: FormGroup = this.fb.group({
    channel_name: ['', [Validators.required, Validators.maxLength(100)]],
    webhook_url: ['', [Validators.required, Validators.pattern(/^https:\/\/discord(app)?\.com\/api\/webhooks\/.+/)]],
    default_message: ['', Validators.maxLength(2000)],
  });

  protected readonly messageForm: FormGroup = this.fb.group({
    webhook_id: ['', Validators.required],
    content: ['', [Validators.required, Validators.maxLength(2000)]],
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

  async ngOnInit(): Promise<void> {
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
}
