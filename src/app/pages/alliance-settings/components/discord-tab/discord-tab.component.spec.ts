import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { signal, WritableSignal } from '@angular/core';
import { DiscordTabComponent } from './discord-tab.component';
import { DiscordService } from '@app/core/services/discord.service';
import { SnackbarService } from '@app/core/services';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import type { DiscordWebhook } from '@app/shared/models';

const mockWebhook: DiscordWebhook = {
  id: 'w1',
  alliance_id: 'a1',
  channel_name: 'general',
  webhook_url: 'https://discord.com/api/webhooks/123/abc',
  default_message: '⏰ Enter your GE ranking!',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('DiscordTabComponent', () => {
  let component: DiscordTabComponent;
  let fixture: ComponentFixture<DiscordTabComponent>;
  let discordService: Mocked<DiscordService>;
  let snackbarService: Mocked<SnackbarService>;
  let webhooksSignal: WritableSignal<DiscordWebhook[]>;

  beforeEach(async () => {
    webhooksSignal = signal<DiscordWebhook[]>([]);

    const discordSpy = {
      webhooks: webhooksSignal,
      loadWebhooks: vi.fn().mockResolvedValue({ error: null }),
      createWebhook: vi.fn().mockResolvedValue({ error: null }),
      updateWebhook: vi.fn().mockResolvedValue({ error: null }),
      deleteWebhook: vi.fn().mockResolvedValue({ error: null }),
      sendMessage: vi.fn().mockResolvedValue({ error: null }),
    };

    const snackbarSpy = {
      success: vi.fn(),
      error: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DiscordTabComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: DiscordService, useValue: discordSpy },
        { provide: SnackbarService, useValue: snackbarSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DiscordTabComponent);
    component = fixture.componentInstance;
    discordService = TestBed.inject(DiscordService) as unknown as Mocked<DiscordService>;
    snackbarService = TestBed.inject(SnackbarService) as unknown as Mocked<SnackbarService>;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load webhooks on init', () => {
    expect(discordService.loadWebhooks).toHaveBeenCalled();
  });

  it('should have webhook form with required fields', () => {
    expect(component['webhookForm'].get('channel_name')).toBeDefined();
    expect(component['webhookForm'].get('webhook_url')).toBeDefined();
    expect(component['webhookForm'].get('default_message')).toBeDefined();
  });

  it('should not submit webhook form if invalid', async () => {
    component['webhookForm'].reset();
    await component['addWebhook']();
    expect(discordService.createWebhook).not.toHaveBeenCalled();
  });

  it('should add webhook with default_message on valid form submission', async () => {
    component['webhookForm'].patchValue({
      channel_name: 'test-channel',
      webhook_url: 'https://discord.com/api/webhooks/123/abc',
      default_message: '⏰ GE Reminder',
    });

    await component['addWebhook']();

    expect(discordService.createWebhook).toHaveBeenCalledWith({
      channel_name: 'test-channel',
      webhook_url: 'https://discord.com/api/webhooks/123/abc',
      default_message: '⏰ GE Reminder',
    });
    expect(snackbarService.success).toHaveBeenCalled();
  });

  it('should add webhook with null default_message when field is empty', async () => {
    component['webhookForm'].patchValue({
      channel_name: 'test-channel',
      webhook_url: 'https://discord.com/api/webhooks/123/abc',
      default_message: '',
    });

    await component['addWebhook']();

    expect(discordService.createWebhook).toHaveBeenCalledWith(expect.objectContaining({ default_message: null }));
  });

  it('should validate webhook URL pattern', () => {
    const urlControl = component['webhookForm'].get('webhook_url');
    urlControl?.setValue('https://example.com/not-discord');
    expect(urlControl?.valid).toBe(false);

    urlControl?.setValue('https://discord.com/api/webhooks/123/abc');
    expect(urlControl?.valid).toBe(true);
  });

  it('should pre-fill content with default_message when channel selected', () => {
    webhooksSignal.set([mockWebhook]);
    fixture.detectChanges();

    component['onChannelSelected']('w1');

    expect(component['messageForm'].get('content')?.value).toBe('⏰ Enter your GE ranking!');
  });

  it('should update selectedWebhookId when channel selected', () => {
    webhooksSignal.set([mockWebhook]);
    component['onChannelSelected']('w1');
    expect(component['selectedWebhookId']()).toBe('w1');
  });

  it('should clear content when channel without default_message is selected', () => {
    const webhookNoMessage: DiscordWebhook = { ...mockWebhook, id: 'w2', default_message: null };
    webhooksSignal.set([webhookNoMessage]);
    component['messageForm'].patchValue({ content: 'previous content' });

    component['onChannelSelected']('w2');

    expect(component['messageForm'].get('content')?.value).toBe('');
  });

  it('should not send message if form is invalid', async () => {
    component['messageForm'].reset();
    await component['sendMessage']();
    expect(discordService.sendMessage).not.toHaveBeenCalled();
  });

  it('should send message to selected webhook', async () => {
    webhooksSignal.set([mockWebhook]);
    fixture.detectChanges();

    component['messageForm'].patchValue({
      webhook_id: 'w1',
      content: 'Hello alliance!',
    });

    await component['sendMessage']();

    expect(discordService.sendMessage).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/123/abc',
      'Hello alliance!'
    );
    expect(snackbarService.success).toHaveBeenCalled();
  });

  it('should restore default_message in content after sending', async () => {
    webhooksSignal.set([mockWebhook]);
    component['messageForm'].patchValue({ webhook_id: 'w1', content: 'Modified message' });

    await component['sendMessage']();

    expect(component['messageForm'].get('content')?.value).toBe('⏰ Enter your GE ranking!');
  });

  it('should show error snackbar when send fails', async () => {
    discordService.sendMessage.mockResolvedValue({ error: new Error('Network error') });
    webhooksSignal.set([mockWebhook]);
    component['messageForm'].patchValue({ webhook_id: 'w1', content: 'Hello!' });

    await component['sendMessage']();

    expect(snackbarService.error).toHaveBeenCalled();
  });

  it('should validate content max length', () => {
    const contentControl = component['messageForm'].get('content');
    contentControl?.setValue('a'.repeat(2001));
    expect(contentControl?.valid).toBe(false);

    contentControl?.setValue('Hello!');
    expect(contentControl?.valid).toBe(true);
  });

  describe('quickSend', () => {
    it('should preselect channel and fill default message', () => {
      webhooksSignal.set([mockWebhook]);

      component['quickSend'](mockWebhook);

      expect(component['messageForm'].get('webhook_id')?.value).toBe('w1');
      expect(component['messageForm'].get('content')?.value).toBe('⏰ Enter your GE ranking!');
      expect(component['selectedWebhookId']()).toBe('w1');
    });
  });

  describe('startAdd / closeForm', () => {
    it('should show form and clear editingWebhook on startAdd', () => {
      component['startAdd']();
      expect(component['isAddingChannel']()).toBe(true);
      expect(component['editingWebhook']()).toBeNull();
    });

    it('should hide form and reset state on closeForm', () => {
      component['startAdd']();
      component['closeForm']();
      expect(component['isAddingChannel']()).toBe(false);
      expect(component['editingWebhook']()).toBeNull();
      expect(component['webhookForm'].get('channel_name')?.value).toBe('');
    });

    it('should close form after successful addWebhook', async () => {
      component['startAdd']();
      component['webhookForm'].patchValue({
        channel_name: 'test',
        webhook_url: 'https://discord.com/api/webhooks/123/abc',
        default_message: '',
      });

      await component['addWebhook']();

      expect(component['isAddingChannel']()).toBe(false);
    });
  });

  describe('edit webhook (unified form)', () => {
    it('should set editingWebhook and populate webhookForm on startEdit', () => {
      component['startEdit'](mockWebhook);

      expect(component['editingWebhook']()).toEqual(mockWebhook);
      expect(component['isAddingChannel']()).toBe(false);
      expect(component['webhookForm'].get('channel_name')?.value).toBe('general');
      expect(component['webhookForm'].get('webhook_url')?.value).toBe('https://discord.com/api/webhooks/123/abc');
      expect(component['webhookForm'].get('default_message')?.value).toBe('⏰ Enter your GE ranking!');
    });

    it('should clear editingWebhook and reset webhookForm on closeForm', () => {
      component['startEdit'](mockWebhook);
      component['closeForm']();

      expect(component['editingWebhook']()).toBeNull();
      expect(component['webhookForm'].get('channel_name')?.value).toBe('');
    });

    it('should not save if webhookForm is invalid', async () => {
      component['startEdit'](mockWebhook);
      component['webhookForm'].get('channel_name')?.setValue('');

      await component['saveEdit']();

      expect(discordService.updateWebhook).not.toHaveBeenCalled();
    });

    it('should call updateWebhook with channel_name and default_message on save', async () => {
      webhooksSignal.set([mockWebhook]);
      component['startEdit'](mockWebhook);
      component['webhookForm'].patchValue({ channel_name: 'renamed', default_message: 'New msg' });

      await component['saveEdit']();

      expect(discordService.updateWebhook).toHaveBeenCalledWith('w1', {
        channel_name: 'renamed',
        default_message: 'New msg',
      });
      expect(snackbarService.success).toHaveBeenCalled();
      expect(component['editingWebhook']()).toBeNull();
    });

    it('should show error snackbar when updateWebhook fails', async () => {
      discordService.updateWebhook.mockResolvedValue({ error: new Error('DB error') });
      component['startEdit'](mockWebhook);
      component['webhookForm'].patchValue({ channel_name: 'renamed', default_message: '' });

      await component['saveEdit']();

      expect(snackbarService.error).toHaveBeenCalled();
    });

    it('should set null default_message when field is empty on save', async () => {
      webhooksSignal.set([mockWebhook]);
      component['startEdit'](mockWebhook);
      component['webhookForm'].patchValue({ channel_name: 'general', default_message: '' });

      await component['saveEdit']();

      expect(discordService.updateWebhook).toHaveBeenCalledWith('w1', {
        channel_name: 'general',
        default_message: null,
      });
    });

    it('should route to saveEdit when handleFormSubmit called while editing', async () => {
      webhooksSignal.set([mockWebhook]);
      component['startEdit'](mockWebhook);
      component['webhookForm'].patchValue({ channel_name: 'renamed', default_message: '' });

      await component['handleFormSubmit']();

      expect(discordService.updateWebhook).toHaveBeenCalled();
      expect(discordService.createWebhook).not.toHaveBeenCalled();
    });

    it('should route to addWebhook when handleFormSubmit called without editing', async () => {
      component['startAdd']();
      component['webhookForm'].patchValue({
        channel_name: 'new-channel',
        webhook_url: 'https://discord.com/api/webhooks/999/xyz',
        default_message: '',
      });

      await component['handleFormSubmit']();

      expect(discordService.createWebhook).toHaveBeenCalled();
      expect(discordService.updateWebhook).not.toHaveBeenCalled();
    });
  });
});
