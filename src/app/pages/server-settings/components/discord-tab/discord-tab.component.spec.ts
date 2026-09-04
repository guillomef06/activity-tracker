import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { signal, WritableSignal, provideZonelessChangeDetection } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { of } from 'rxjs';
import { DiscordTabComponent } from './discord-tab.component';
import { DiscordService } from '@app/core/services/discord.service';
import { DiscordScheduledMessageService } from '@app/core/services/discord-scheduled-message.service';
import { SnackbarService } from '@app/core/services';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import type { DiscordWebhook, DiscordScheduledMessage } from '@app/shared/models';

const mockWebhook: DiscordWebhook = {
  id: 'w1',
  server_id: 'a1',
  channel_name: 'general',
  webhook_url: 'https://discord.com/api/webhooks/123/abc',
  default_message: '⏰ Enter your GE ranking!',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockSchedule: DiscordScheduledMessage = {
  id: 's1',
  server_id: 'a1',
  webhook_id: 'w1',
  message: 'Reminder!',
  frequency: 'weekly',
  days_of_week: [2, 6],
  day_of_month: null,
  hour_utc: 19,
  is_active: true,
  created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('DiscordTabComponent', () => {
  let component: DiscordTabComponent;
  let fixture: ComponentFixture<DiscordTabComponent>;
  let discordService: Mocked<DiscordService>;
  let discordScheduleService: Mocked<DiscordScheduledMessageService>;
  let snackbarService: Mocked<SnackbarService>;
  let webhooksSignal: WritableSignal<DiscordWebhook[]>;
  let schedulesSignal: WritableSignal<DiscordScheduledMessage[]>;
  let dialogSpy: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    webhooksSignal = signal<DiscordWebhook[]>([]);
    schedulesSignal = signal<DiscordScheduledMessage[]>([]);

    const discordSpy = {
      webhooks: webhooksSignal,
      loadWebhooks: vi.fn().mockResolvedValue({ error: null }),
      createWebhook: vi.fn().mockResolvedValue({ error: null }),
      updateWebhook: vi.fn().mockResolvedValue({ error: null }),
      deleteWebhook: vi.fn().mockResolvedValue({ error: null }),
      sendMessage: vi.fn().mockResolvedValue({ error: null }),
    };

    const discordScheduleSpy = {
      schedules: schedulesSignal,
      loadSchedules: vi.fn().mockResolvedValue({ error: null }),
      createSchedule: vi.fn().mockResolvedValue({ error: null }),
      updateSchedule: vi.fn().mockResolvedValue({ error: null }),
      toggleActive: vi.fn().mockResolvedValue({ error: null }),
      deleteSchedule: vi.fn().mockResolvedValue({ error: null }),
    };

    const snackbarSpy = {
      success: vi.fn(),
      error: vi.fn(),
    };

    dialogSpy = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };

    await TestBed.configureTestingModule({
      imports: [DiscordTabComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: DiscordService, useValue: discordSpy },
        { provide: DiscordScheduledMessageService, useValue: discordScheduleSpy },
        { provide: SnackbarService, useValue: snackbarSpy },
        { provide: MatDialog, useValue: dialogSpy },
        provideZonelessChangeDetection(),
      ],
    })
      .overrideComponent(DiscordTabComponent, { remove: { imports: [MatDialogModule] } })
      .compileComponents();

    fixture = TestBed.createComponent(DiscordTabComponent);
    component = fixture.componentInstance;
    discordService = TestBed.inject(DiscordService) as unknown as Mocked<DiscordService>;
    discordScheduleService = TestBed.inject(
      DiscordScheduledMessageService
    ) as unknown as Mocked<DiscordScheduledMessageService>;
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
      content: 'Hello server!',
    });

    await component['sendMessage']();

    expect(discordService.sendMessage).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/123/abc',
      'Hello server!'
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

  describe('scheduleForm validity (isScheduleFormValid)', () => {
    it('should be invalid when webhook_id and message are empty', () => {
      expect(component['isScheduleFormValid']).toBe(false);
    });

    it('should be valid for daily frequency once webhook_id and message are filled', () => {
      component['scheduleForm'].patchValue({
        webhook_id: 'w1',
        message: 'Reminder!',
        frequency: 'daily',
      });

      expect(component['isScheduleFormValid']).toBe(true);
    });

    it('should be invalid for weekly frequency when no day of week is checked', () => {
      component['scheduleForm'].patchValue({
        webhook_id: 'w1',
        message: 'Reminder!',
        frequency: 'weekly',
      });

      expect(component['isScheduleFormValid']).toBe(false);
    });

    it('should be valid for weekly frequency once at least one day of week is checked', () => {
      component['scheduleForm'].patchValue({
        webhook_id: 'w1',
        message: 'Reminder!',
        frequency: 'weekly',
      });
      component['scheduleForm'].controls.days_of_week.controls[0].setValue(true);

      expect(component['isScheduleFormValid']).toBe(true);
    });

    it('should be valid for monthly frequency without checking days of week', () => {
      component['scheduleForm'].patchValue({
        webhook_id: 'w1',
        message: 'Reminder!',
        frequency: 'monthly',
        day_of_month: 15,
      });

      expect(component['isScheduleFormValid']).toBe(true);
    });
  });

  describe('startAddSchedule / startEditSchedule / closeScheduleForm', () => {
    it('should show the form and clear editingSchedule on startAddSchedule', () => {
      component['startAddSchedule']();

      expect(component['isAddingSchedule']()).toBe(true);
      expect(component['editingSchedule']()).toBeNull();
      expect(component['scheduleForm'].get('webhook_id')?.value).toBe('');
      expect(component['scheduleForm'].get('message')?.value).toBe('');
    });

    it('should hide the form and reset state on closeScheduleForm', () => {
      component['startAddSchedule']();
      component['scheduleForm'].patchValue({ webhook_id: 'w1', message: 'Reminder!' });

      component['closeScheduleForm']();

      expect(component['isAddingSchedule']()).toBe(false);
      expect(component['editingSchedule']()).toBeNull();
      expect(component['scheduleForm'].get('webhook_id')?.value).toBe('');
      expect(component['scheduleForm'].get('message')?.value).toBe('');
    });

    it('should reset all days_of_week checkboxes on closeScheduleForm', () => {
      component['startEditSchedule'](mockSchedule);

      component['closeScheduleForm']();

      const daysChecked = component['scheduleForm'].controls.days_of_week.controls.map(c => c.value);
      expect(daysChecked).toEqual([false, false, false, false, false, false, false]);
    });

    it('should populate scheduleForm fields and check the matching days_of_week controls on startEditSchedule', () => {
      component['startEditSchedule'](mockSchedule);

      expect(component['editingSchedule']()).toEqual(mockSchedule);
      expect(component['isAddingSchedule']()).toBe(false);
      expect(component['scheduleForm'].get('webhook_id')?.value).toBe('w1');
      expect(component['scheduleForm'].get('message')?.value).toBe('Reminder!');
      expect(component['scheduleForm'].get('frequency')?.value).toBe('weekly');
      expect(component['scheduleForm'].get('hour_utc')?.value).toBe(19);

      // WEEK_DAYS order is [Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=7]; schedule has days_of_week [2, 6]
      const daysChecked = component['scheduleForm'].controls.days_of_week.controls.map(c => c.value);
      expect(daysChecked).toEqual([false, true, false, false, false, true, false]);
    });

    it('should default day_of_month when schedule has none set', () => {
      const scheduleNoDayOfMonth: DiscordScheduledMessage = { ...mockSchedule, day_of_month: null };

      component['startEditSchedule'](scheduleNoDayOfMonth);

      expect(component['scheduleForm'].get('day_of_month')?.value).toBe(1);
    });
  });

  describe('addSchedule', () => {
    it('should not call createSchedule when form is invalid', async () => {
      await component['addSchedule']();
      expect(discordScheduleService.createSchedule).not.toHaveBeenCalled();
    });

    it('should create schedule with correctly-shaped request and close the form on success', async () => {
      component['startAddSchedule']();
      component['scheduleForm'].patchValue({
        webhook_id: 'w1',
        message: 'Reminder!',
        frequency: 'weekly',
        hour_utc: 9,
      });
      component['scheduleForm'].controls.days_of_week.controls[1].setValue(true);
      component['scheduleForm'].controls.days_of_week.controls[5].setValue(true);

      await component['addSchedule']();

      expect(discordScheduleService.createSchedule).toHaveBeenCalledWith({
        webhook_id: 'w1',
        message: 'Reminder!',
        frequency: 'weekly',
        days_of_week: [2, 6],
        day_of_month: null,
        hour_utc: 9,
      });
      expect(snackbarService.success).toHaveBeenCalled();
      expect(component['isAddingSchedule']()).toBe(false);
    });

    it('should build a monthly request with day_of_month and null days_of_week', async () => {
      component['startAddSchedule']();
      component['scheduleForm'].patchValue({
        webhook_id: 'w1',
        message: 'Reminder!',
        frequency: 'monthly',
        day_of_month: 15,
        hour_utc: 9,
      });

      await component['addSchedule']();

      expect(discordScheduleService.createSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ frequency: 'monthly', day_of_month: 15, days_of_week: null })
      );
    });

    it('should show error snackbar and keep the form open when createSchedule fails', async () => {
      discordScheduleService.createSchedule.mockResolvedValue({ error: new Error('DB error') });
      component['startAddSchedule']();
      component['scheduleForm'].patchValue({ webhook_id: 'w1', message: 'Reminder!', frequency: 'daily' });

      await component['addSchedule']();

      expect(snackbarService.error).toHaveBeenCalled();
      expect(component['isAddingSchedule']()).toBe(true);
    });
  });

  describe('saveScheduleEdit', () => {
    it('should not call updateSchedule when form is invalid', async () => {
      component['startEditSchedule'](mockSchedule);
      component['scheduleForm'].get('message')?.setValue('');

      await component['saveScheduleEdit']();

      expect(discordScheduleService.updateSchedule).not.toHaveBeenCalled();
    });

    it('should update schedule with correctly-shaped request and close the form on success', async () => {
      component['startEditSchedule'](mockSchedule);
      component['scheduleForm'].patchValue({ message: 'Updated reminder!' });

      await component['saveScheduleEdit']();

      expect(discordScheduleService.updateSchedule).toHaveBeenCalledWith('s1', {
        webhook_id: 'w1',
        message: 'Updated reminder!',
        frequency: 'weekly',
        days_of_week: [2, 6],
        day_of_month: null,
        hour_utc: 19,
      });
      expect(snackbarService.success).toHaveBeenCalled();
      expect(component['editingSchedule']()).toBeNull();
    });

    it('should show error snackbar and keep the form open when updateSchedule fails', async () => {
      discordScheduleService.updateSchedule.mockResolvedValue({ error: new Error('DB error') });
      component['startEditSchedule'](mockSchedule);

      await component['saveScheduleEdit']();

      expect(snackbarService.error).toHaveBeenCalled();
      expect(component['editingSchedule']()).toEqual(mockSchedule);
    });
  });

  describe('handleScheduleFormSubmit', () => {
    it('should route to saveScheduleEdit when editing', async () => {
      component['startEditSchedule'](mockSchedule);

      await component['handleScheduleFormSubmit']();

      expect(discordScheduleService.updateSchedule).toHaveBeenCalled();
      expect(discordScheduleService.createSchedule).not.toHaveBeenCalled();
    });

    it('should route to addSchedule when not editing', async () => {
      component['startAddSchedule']();
      component['scheduleForm'].patchValue({ webhook_id: 'w1', message: 'Reminder!', frequency: 'daily' });

      await component['handleScheduleFormSubmit']();

      expect(discordScheduleService.createSchedule).toHaveBeenCalled();
      expect(discordScheduleService.updateSchedule).not.toHaveBeenCalled();
    });
  });

  describe('toggleScheduleActive', () => {
    it('should toggle is_active to the opposite value and show success snackbar', async () => {
      await component['toggleScheduleActive'](mockSchedule);

      expect(discordScheduleService.toggleActive).toHaveBeenCalledWith('s1', false);
      expect(snackbarService.success).toHaveBeenCalled();
    });

    it('should show error snackbar when toggleActive fails', async () => {
      discordScheduleService.toggleActive.mockResolvedValue({ error: new Error('DB error') });

      await component['toggleScheduleActive'](mockSchedule);

      expect(snackbarService.error).toHaveBeenCalled();
    });
  });

  describe('deleteSchedule', () => {
    it('should not delete when confirmation dialog is dismissed', async () => {
      dialogSpy.open.mockReturnValue({ afterClosed: () => of(false) });

      await component['deleteSchedule'](mockSchedule);

      expect(discordScheduleService.deleteSchedule).not.toHaveBeenCalled();
    });

    it('should delete the schedule after confirmation and show success snackbar', async () => {
      await component['deleteSchedule'](mockSchedule);

      expect(discordScheduleService.deleteSchedule).toHaveBeenCalledWith('s1');
      expect(snackbarService.success).toHaveBeenCalled();
    });

    it('should close the schedule form when the deleted schedule was being edited', async () => {
      component['startEditSchedule'](mockSchedule);

      await component['deleteSchedule'](mockSchedule);

      expect(component['isAddingSchedule']()).toBe(false);
      expect(component['editingSchedule']()).toBeNull();
    });

    it('should show error snackbar when deleteSchedule fails', async () => {
      discordScheduleService.deleteSchedule.mockResolvedValue({ error: new Error('DB error') });

      await component['deleteSchedule'](mockSchedule);

      expect(snackbarService.error).toHaveBeenCalled();
    });
  });

  describe('scheduleViewModels', () => {
    it('should build channelName and summary from the matching webhook and schedule fields', () => {
      webhooksSignal.set([mockWebhook]);
      schedulesSignal.set([mockSchedule]);
      fixture.detectChanges();

      const viewModels = component['scheduleViewModels']();

      expect(viewModels).toHaveLength(1);
      expect(viewModels[0].schedule).toEqual(mockSchedule);
      expect(viewModels[0].channelName).toBe('general');
      expect(viewModels[0].summary).toContain('discord.schedule.summaryWeekly');
    });

    it('should use an empty channelName when no webhook matches the schedule', () => {
      schedulesSignal.set([{ ...mockSchedule, webhook_id: 'missing-webhook' }]);
      fixture.detectChanges();

      const viewModels = component['scheduleViewModels']();

      expect(viewModels[0].channelName).toBe('');
    });
  });
});
