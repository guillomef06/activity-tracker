import { TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { DiscordService } from './discord.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

const mockWebhook = {
  id: 'w1',
  server_id: 'a1',
  channel_name: 'general',
  webhook_url: 'https://discord.com/api/webhooks/123/abc',
  default_message: '⏰ GE Reminder',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('DiscordService', () => {
  let service: DiscordService;
  let supabaseService: Mocked<SupabaseService>;
  let authService: Mocked<AuthService>;

  beforeEach(() => {
    const supabaseSpy = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };

    const authSpy = {
      getServerId: vi.fn().mockReturnValue('a1'),
      isAdmin: vi.fn().mockReturnValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DiscordService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: AuthService, useValue: authSpy },
      ],
    });

    service = TestBed.inject(DiscordService);
    supabaseService = TestBed.inject(SupabaseService) as unknown as Mocked<SupabaseService>;
    authService = TestBed.inject(AuthService) as unknown as Mocked<AuthService>;
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with empty webhooks', () => {
    expect(service.webhooks()).toEqual([]);
  });

  describe('loadWebhooks', () => {
    it('should return empty and set no webhooks when no server ID', async () => {
      authService.getServerId.mockReturnValue(null);
      const result = await service.loadWebhooks();
      expect(result.error).toBeNull();
      expect(service.webhooks()).toEqual([]);
    });

    it('should load webhooks from supabase', async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [mockWebhook], error: null }),
      };
      supabaseService.from.mockReturnValue(builder as never);

      const result = await service.loadWebhooks();
      expect(result.error).toBeNull();
      expect(service.webhooks()).toEqual([mockWebhook]);
    });

    it('should return error when supabase fails', async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      };
      supabaseService.from.mockReturnValue(builder as never);

      const result = await service.loadWebhooks();
      expect(result.error).toBeInstanceOf(Error);
    });
  });

  describe('createWebhook', () => {
    it('should return error when not admin', async () => {
      authService.isAdmin.mockReturnValue(false);
      const result = await service.createWebhook({ channel_name: 'test', webhook_url: 'https://discord.com/...' });
      expect(result.error).toBeInstanceOf(Error);
    });

    it('should return error when no server ID', async () => {
      authService.getServerId.mockReturnValue(null);
      const result = await service.createWebhook({ channel_name: 'test', webhook_url: 'https://discord.com/...' });
      expect(result.error).toBeInstanceOf(Error);
    });

    it('should pass default_message when provided', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      const orderMock = vi.fn().mockResolvedValue({ data: [], error: null });
      const eqForLoad = vi.fn().mockReturnValue({ order: orderMock });
      const selectForLoad = vi.fn().mockReturnValue({ eq: eqForLoad });

      let callCount = 0;
      supabaseService.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { insert: insertMock } as never;
        return { select: selectForLoad } as never;
      });

      await service.createWebhook({
        channel_name: 'test',
        webhook_url: 'https://discord.com/api/webhooks/123/abc',
        default_message: '⏰ GE Reminder',
      });

      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ default_message: '⏰ GE Reminder' }));
    });
  });

  describe('updateWebhook', () => {
    it('should return error when not admin', async () => {
      authService.isAdmin.mockReturnValue(false);
      const result = await service.updateWebhook('w1', { channel_name: 'new', default_message: null });
      expect(result.error).toBeInstanceOf(Error);
    });

    it('should update channel_name and default_message', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      const orderMock = vi.fn().mockResolvedValue({ data: [], error: null });
      const eqForLoad = vi.fn().mockReturnValue({ order: orderMock });
      const selectForLoad = vi.fn().mockReturnValue({ eq: eqForLoad });

      let callCount = 0;
      supabaseService.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { update: updateMock } as never;
        return { select: selectForLoad } as never;
      });

      const result = await service.updateWebhook('w1', {
        channel_name: 'updated-channel',
        default_message: 'New default',
      });

      expect(result.error).toBeNull();
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ channel_name: 'updated-channel', default_message: 'New default' })
      );
    });
  });

  describe('deleteWebhook', () => {
    it('should return error when not admin', async () => {
      authService.isAdmin.mockReturnValue(false);
      const result = await service.deleteWebhook('w1');
      expect(result.error).toBeInstanceOf(Error);
    });
  });

  describe('sendMessage', () => {
    it('should send message to webhook URL', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const result = await service.sendMessage('https://discord.com/api/webhooks/test', 'Hello!');
      expect(result.error).toBeNull();
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'Hello!' }),
        })
      );
    });

    it('should return error when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const result = await service.sendMessage('https://discord.com/api/webhooks/test', 'Hello!');
      expect(result.error).toBeInstanceOf(Error);
    });

    it('should return error when discord API returns non-ok status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' }));
      const result = await service.sendMessage('https://discord.com/api/webhooks/test', 'Hello!');
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toContain('400');
    });
  });
});
