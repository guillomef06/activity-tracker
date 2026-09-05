import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { ReleaseNotesService, ReleaseNote } from './release-notes.service';
import { StorageService } from './storage.service';
import { environment } from '../../../environments/environment';

describe('ReleaseNotesService', () => {
  let service: ReleaseNotesService;
  let httpController: HttpTestingController;
  let storageGetSpy: ReturnType<typeof vi.fn>;
  let storageSetSpy: ReturnType<typeof vi.fn>;

  const mockNotes: ReleaseNote[] = [
    {
      version: '1.0.0',
      date: '2026-02-22',
      entries: [
        { type: 'feature', text: { en: 'Feature A', fr: 'Fonctionnalité A', es: 'Función A', it: 'Funzionalità A' } },
      ],
    },
  ];

  const createService = (seenVersion: string | null = null): void => {
    storageGetSpy = vi.fn().mockReturnValue(seenVersion);
    storageSetSpy = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ReleaseNotesService,
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: StorageService, useValue: { get: storageGetSpy, set: storageSetSpy } },
      ],
    });

    service = TestBed.inject(ReleaseNotesService);
    httpController = TestBed.inject(HttpTestingController);
    // rxResource's loader is triggered by an effect on the request signal — flush it
    // so the HTTP request is actually issued before the test asserts on it.
    TestBed.tick();
  };

  /**
   * Flushes the pending release-notes HTTP request and waits for the
   * rxResource loader to settle. `resource()` registers a `PendingTask`
   * while its loader awaits the stream (see `ResourceImpl.loadEffect` in
   * `@angular/core`), so `ApplicationRef.whenStable()` — not a fixed number
   * of microtask ticks — is the documented way to know its `value()` signal
   * has been updated with the resolved HTTP response.
   */
  const flushNotesRequest = async (notes: ReleaseNote[]): Promise<void> => {
    httpController.expectOne('assets/release-notes.json').flush(notes);
    await TestBed.inject(ApplicationRef).whenStable();
  };

  afterEach(() => {
    httpController.verify();
    TestBed.resetTestingModule();
  });

  it('should create', async () => {
    createService();
    await flushNotesRequest([]);
    expect(service).toBeTruthy();
  });

  it('should start with empty notes', async () => {
    createService();
    expect(service.notes()).toEqual([]);
    await flushNotesRequest([]);
  });

  it('should load notes from JSON on construction', async () => {
    createService();
    await flushNotesRequest(mockNotes);
    expect(service.notes()).toEqual(mockNotes);
  });

  describe('hasUnseenNotes()', () => {
    it('should be false when notes are empty', async () => {
      createService(null);
      expect(service.hasUnseenNotes()).toBe(false);
      await flushNotesRequest([]);
    });

    it('should be true when notes loaded and seenVersion differs from appVersion', async () => {
      createService('0.0.0');
      await flushNotesRequest(mockNotes);
      expect(service.hasUnseenNotes()).toBe(true);
    });

    it('should be false when seenVersion matches appVersion', async () => {
      createService(environment.appVersion);
      await flushNotesRequest(mockNotes);
      expect(service.hasUnseenNotes()).toBe(false);
    });

    it('should be true when seenVersion is null', async () => {
      createService(null);
      await flushNotesRequest(mockNotes);
      expect(service.hasUnseenNotes()).toBe(true);
    });
  });

  describe('markAsSeen()', () => {
    it('should persist appVersion to storage', async () => {
      createService(null);
      await flushNotesRequest(mockNotes);
      service.markAsSeen();
      expect(storageSetSpy).toHaveBeenCalledWith('release-notes-seen-version', environment.appVersion);
    });

    it('should set hasUnseenNotes to false after calling markAsSeen', async () => {
      createService(null);
      await flushNotesRequest(mockNotes);
      expect(service.hasUnseenNotes()).toBe(true);
      service.markAsSeen();
      expect(service.hasUnseenNotes()).toBe(false);
    });
  });
});
