import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { VoterTokenService } from './voter-token.service';
import { StorageService } from './storage.service';

describe('VoterTokenService', () => {
  let service: VoterTokenService;
  let storageServiceMock: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  // Mocking the injected StorageService (rather than spying on the global
  // Storage/localStorage) keeps this spec isolated from other spec files:
  // Angular's Vitest builder runs test files with `isolate: false`, so all
  // files share one jsdom environment/localStorage, and a global spy here
  // can be restored mid-test by another file's cleanup hook.
  beforeEach(() => {
    storageServiceMock = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [VoterTokenService, { provide: StorageService, useValue: storageServiceMock }],
    });

    service = TestBed.inject(VoterTokenService);
  });

  describe('getVoterToken', () => {
    it('should generate and persist a UUID when no token exists', () => {
      // Arrange — storageServiceMock.get() returns null by default

      // Act
      const token = service.getVoterToken();

      // Assert
      expect(token).toBeTruthy();
      expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(storageServiceMock.set).toHaveBeenCalledWith('guide_voter_token', token);
    });

    it('should return the same token on subsequent calls', () => {
      // Arrange
      const first = service.getVoterToken();
      storageServiceMock.get.mockReturnValue(first);

      // Act
      const second = service.getVoterToken();

      // Assert
      expect(second).toBe(first);
    });

    it('should return the stored token without generating a new one', () => {
      // Arrange
      const existingToken = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      storageServiceMock.get.mockReturnValue(existingToken);

      // Act
      const token = service.getVoterToken();

      // Assert
      expect(token).toBe(existingToken);
      expect(storageServiceMock.set).not.toHaveBeenCalled();
    });

    it('should not call set when an existing token is found', () => {
      // Arrange
      storageServiceMock.get.mockReturnValue('existing-uuid-value');

      // Act
      service.getVoterToken();

      // Assert
      expect(storageServiceMock.set).not.toHaveBeenCalled();
    });
  });
});
