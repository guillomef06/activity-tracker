import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { WritableSignal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { Router } from '@angular/router';
import { UserProfile } from '@app/shared/models/user.model';
import { User } from '@supabase/supabase-js';

const mockProfile: UserProfile = {
  id: 'user-1',
  display_name: 'Test User',
  username: 'testuser',
  role: 'member',
  alliance_id: 'alliance-1',
  invitation_token_id: null,
  recovery_question_id: 1,
  created_at: '',
  updated_at: '',
};

interface AuthInternals {
  currentUserSignal: WritableSignal<User | null>;
  userProfileSignal: WritableSignal<UserProfile | null>;
}

describe('AuthService — recovery methods', () => {
  let service: AuthService;
  let rpcMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rpcMock = vi.fn();

    const supabaseMock = {
      auth: {
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      rpc: rpcMock,
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  describe('getRecoveryQuestion', () => {
    it('returns questionId on success', async () => {
      rpcMock.mockResolvedValue({ data: { question_id: 3 }, error: null });
      const result = await service.getRecoveryQuestion('testuser');
      expect(result.questionId).toBe(3);
      expect(result.error).toBeNull();
    });

    it('returns error when user not found', async () => {
      rpcMock.mockResolvedValue({ data: { error: 'user_not_found' }, error: null });
      const result = await service.getRecoveryQuestion('unknown');
      expect(result.questionId).toBeNull();
      expect(result.error).toBe('recovery.errors.userNotFound');
    });

    it('returns error on RPC failure', async () => {
      rpcMock.mockResolvedValue({ data: null, error: { message: 'db error' } });
      const result = await service.getRecoveryQuestion('testuser');
      expect(result.questionId).toBeNull();
      expect(result.error).toBe('recovery.errors.userNotFound');
    });
  });

  describe('resetPasswordWithRecovery', () => {
    it('returns no error on success', async () => {
      rpcMock.mockResolvedValue({ data: { success: true }, error: null });
      const result = await service.resetPasswordWithRecovery('user', 'answer', 'NewPass1');
      expect(result.error).toBeNull();
    });

    it('returns wrongAnswer error with remaining count', async () => {
      rpcMock.mockResolvedValue({ data: { error: 'wrong_answer', remaining: 3 }, error: null });
      const result = await service.resetPasswordWithRecovery('user', 'bad', 'NewPass1');
      expect(result.error).toBe('recovery.errors.wrongAnswer');
      expect(result.remaining).toBe(3);
    });

    it('returns locked error with until timestamp', async () => {
      rpcMock.mockResolvedValue({ data: { error: 'locked', until: '2026-03-20T10:15:00Z' }, error: null });
      const result = await service.resetPasswordWithRecovery('user', 'bad', 'NewPass1');
      expect(result.error).toBe('recovery.errors.locked');
      expect(result.until).toBe('2026-03-20T10:15:00Z');
    });

    it('returns error on RPC failure', async () => {
      rpcMock.mockResolvedValue({ data: null, error: { message: 'db error' } });
      const result = await service.resetPasswordWithRecovery('user', 'answer', 'NewPass1');
      expect(result.error).toBe('recovery.errors.userNotFound');
    });
  });
});

describe('AuthService — account update methods', () => {
  let service: AuthService;
  let chainMock: { update: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> };
  let updateUserMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    chainMock = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    updateUserMock = vi.fn().mockResolvedValue({ error: null });

    const supabaseMock = {
      auth: {
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        updateUser: updateUserMock,
      },
      from: vi.fn().mockReturnValue(chainMock),
      rpc: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });

    service = TestBed.inject(AuthService);
    const internals = service as unknown as AuthInternals;
    internals.currentUserSignal.set({ id: 'user-1' } as User);
    internals.userProfileSignal.set(mockProfile);
  });

  describe('updateDisplayName', () => {
    it('returns no error and updates the profile signal', async () => {
      const result = await service.updateDisplayName('New Name');
      expect(result.error).toBeNull();
      expect(service.userProfile()?.display_name).toBe('New Name');
    });

    it('returns error message on DB failure', async () => {
      chainMock.eq = vi.fn().mockResolvedValue({ error: { message: 'DB error' } });
      const result = await service.updateDisplayName('New Name');
      expect(result.error).toBe('DB error');
    });

    it('returns error when not authenticated', async () => {
      (service as unknown as AuthInternals).currentUserSignal.set(null);
      const result = await service.updateDisplayName('New Name');
      expect(result.error).toBe('Not authenticated');
    });
  });

  describe('updatePassword', () => {
    it('calls auth.updateUser and returns no error', async () => {
      const result = await service.updatePassword('NewPass1');
      expect(result.error).toBeNull();
      expect(updateUserMock).toHaveBeenCalledWith({ password: 'NewPass1' });
    });

    it('returns error message on auth failure', async () => {
      updateUserMock.mockResolvedValue({ error: { message: 'Auth error' } });
      const result = await service.updatePassword('NewPass1');
      expect(result.error).toBe('Auth error');
    });
  });

  describe('updateRecovery', () => {
    it('returns no error and updates the recovery_question_id signal', async () => {
      const result = await service.updateRecovery(3, 'my answer');
      expect(result.error).toBeNull();
      expect(service.userProfile()?.recovery_question_id).toBe(3);
    });

    it('returns error message on DB failure', async () => {
      chainMock.eq = vi.fn().mockResolvedValue({ error: { message: 'DB error' } });
      const result = await service.updateRecovery(3, 'my answer');
      expect(result.error).toBe('DB error');
    });

    it('returns error when not authenticated', async () => {
      (service as unknown as AuthInternals).currentUserSignal.set(null);
      const result = await service.updateRecovery(3, 'my answer');
      expect(result.error).toBe('Not authenticated');
    });
  });
});
