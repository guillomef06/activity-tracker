import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { ServerService, PARTIAL_REPLACE_FAILURE_PREFIX } from './server.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { CreatePointRuleRequest, UserProfile } from '@app/shared/models';

/** Builds a minimal valid tranche request — overrides only what a test cares about. */
const buildTranche = (overrides: Partial<CreatePointRuleRequest> = {}): CreatePointRuleRequest => ({
  activity_type: 'development',
  position_min: 1,
  position_max: 10,
  points: 50,
  ...overrides,
});

describe('ServerService', () => {
  describe('replaceRulesForActivityType', () => {
    let service: ServerService;
    let deleteEqSpy2: ReturnType<typeof vi.fn>;
    let deleteEqSpy1: ReturnType<typeof vi.fn>;
    let deleteMock: ReturnType<typeof vi.fn>;
    let insertMock: ReturnType<typeof vi.fn>;
    let fromMock: ReturnType<typeof vi.fn>;
    let userProfileSignal: ReturnType<typeof signal<UserProfile | null>>;

    /** Wires up the chained supabase mock: delete().eq().eq() and insert(). Result objects are promise-resolved. */
    const buildSupabaseMock = (
      deleteResult: { error: { message: string } | null },
      insertResult: { error: { message: string } | null }
    ): { from: ReturnType<typeof vi.fn> } => {
      deleteEqSpy2 = vi.fn().mockResolvedValue(deleteResult);
      deleteEqSpy1 = vi.fn().mockReturnValue({ eq: deleteEqSpy2 });
      deleteMock = vi.fn().mockReturnValue({ eq: deleteEqSpy1 });
      insertMock = vi.fn().mockResolvedValue(insertResult);
      fromMock = vi.fn().mockReturnValue({
        delete: deleteMock,
        insert: insertMock,
      });
      return { from: fromMock };
    };

    const setup = (
      serverId: string | null,
      deleteResult: { error: { message: string } | null } = { error: null },
      insertResult: { error: { message: string } | null } = { error: null }
    ): void => {
      userProfileSignal = signal<UserProfile | null>(
        serverId
          ? ({
              id: 'user-1',
              server_id: serverId,
              role: 'admin',
              display_name: 'Admin',
              username: 'admin',
            } as UserProfile)
          : null
      );

      const supabaseMock = buildSupabaseMock(deleteResult, insertResult);
      const authMock = {
        userProfile: userProfileSignal,
        getServerId: vi.fn().mockReturnValue(serverId),
        getUserId: vi.fn().mockReturnValue('user-1'),
        isAdmin: vi.fn().mockReturnValue(true),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          ServerService,
          { provide: SupabaseService, useValue: supabaseMock },
          { provide: AuthService, useValue: authMock },
        ],
      });

      service = TestBed.inject(ServerService);
    };

    it('should return "No server ID" error without calling Supabase when the profile has no server_id', async () => {
      // Arrange
      setup(null);

      // Act
      const result = await service.replaceRulesForActivityType('development', [buildTranche()]);

      // Assert
      expect(result.error).toEqual(new Error('No server ID'));
      expect(fromMock).not.toHaveBeenCalled();
    });

    it('should return the delete error and never attempt the insert when delete fails', async () => {
      // Arrange
      setup('server-1', { error: { message: 'delete failed' } });

      // Act
      const result = await service.replaceRulesForActivityType('development', [buildTranche()]);

      // Assert
      expect(result.error).toEqual(new Error('delete failed'));
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('should not call loadRules when delete fails', async () => {
      // Arrange
      setup('server-1', { error: { message: 'delete failed' } });
      const loadRulesSpy = vi.spyOn(service, 'loadRules');

      // Act
      await service.replaceRulesForActivityType('development', [buildTranche()]);

      // Assert
      expect(loadRulesSpy).not.toHaveBeenCalled();
    });

    it('should prefix the error with PARTIAL_REPLACE_FAILURE_PREFIX when delete succeeds but insert fails', async () => {
      // Arrange
      setup('server-1', { error: null }, { error: { message: 'insert failed' } });
      vi.spyOn(service, 'loadRules').mockResolvedValue({ error: null });

      // Act
      const result = await service.replaceRulesForActivityType('development', [buildTranche()]);

      // Assert
      expect(result.error?.message).toBe(`${PARTIAL_REPLACE_FAILURE_PREFIX}insert failed`);
    });

    it('should still reload rules when the insert fails after a successful delete', async () => {
      // Arrange
      setup('server-1', { error: null }, { error: { message: 'insert failed' } });
      const loadRulesSpy = vi.spyOn(service, 'loadRules').mockResolvedValue({ error: null });

      // Act
      await service.replaceRulesForActivityType('development', [buildTranche()]);

      // Assert
      expect(loadRulesSpy).toHaveBeenCalledOnce();
    });

    it('should return a null error and reload rules when both delete and insert succeed', async () => {
      // Arrange
      setup('server-1');
      const loadRulesSpy = vi.spyOn(service, 'loadRules').mockResolvedValue({ error: null });

      // Act
      const result = await service.replaceRulesForActivityType('development', [buildTranche()]);

      // Assert
      expect(result.error).toBeNull();
      expect(loadRulesSpy).toHaveBeenCalledOnce();
    });

    it('should merge server_id onto every inserted rule', async () => {
      // Arrange
      setup('server-1');
      vi.spyOn(service, 'loadRules').mockResolvedValue({ error: null });
      const tranches = [
        buildTranche({ position_min: 1, position_max: 10, points: 50 }),
        buildTranche({ position_min: 11, position_max: 20, points: 40 }),
      ];

      // Act
      await service.replaceRulesForActivityType('development', tranches);

      // Assert
      expect(insertMock).toHaveBeenCalledWith([
        { server_id: 'server-1', activity_type: 'development', position_min: 1, position_max: 10, points: 50 },
        { server_id: 'server-1', activity_type: 'development', position_min: 11, position_max: 20, points: 40 },
      ]);
    });

    it('should scope the delete to the profile server_id and the given activity type', async () => {
      // Arrange
      setup('server-1');
      vi.spyOn(service, 'loadRules').mockResolvedValue({ error: null });

      // Act
      await service.replaceRulesForActivityType('legion', [buildTranche({ activity_type: 'legion' })]);

      // Assert
      expect(deleteEqSpy1).toHaveBeenCalledWith('server_id', 'server-1');
      expect(deleteEqSpy2).toHaveBeenCalledWith('activity_type', 'legion');
    });
  });
});
