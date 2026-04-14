import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { VoterTokenService } from './voter-token.service';

describe('VoterTokenService', () => {
  let service: VoterTokenService;
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      return localStorageMock[key] ?? null;
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      localStorageMock[key] = value;
    });

    TestBed.configureTestingModule({
      providers: [VoterTokenService],
    });

    service = TestBed.inject(VoterTokenService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getVoterToken', () => {
    it('should generate and persist a UUID when no token exists', () => {
      // Arrange — localStorage is empty

      // Act
      const token = service.getVoterToken();

      // Assert
      expect(token).toBeTruthy();
      expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(localStorage.setItem).toHaveBeenCalledWith('guide_voter_token', token);
    });

    it('should return the same token on subsequent calls', () => {
      // Arrange
      const first = service.getVoterToken();

      // Act
      const second = service.getVoterToken();

      // Assert
      expect(second).toBe(first);
    });

    it('should return the stored token without generating a new one', () => {
      // Arrange
      const existingToken = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      localStorageMock['guide_voter_token'] = existingToken;

      // Act
      const token = service.getVoterToken();

      // Assert
      expect(token).toBe(existingToken);
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('should not call setItem when an existing token is found', () => {
      // Arrange
      localStorageMock['guide_voter_token'] = 'existing-uuid-value';

      // Act
      service.getVoterToken();

      // Assert
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });
});
