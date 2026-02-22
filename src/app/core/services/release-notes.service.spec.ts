import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
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

  const createService = (seenVersion: string | null = null) => {
    storageGetSpy = vi.fn().mockReturnValue(seenVersion);
    storageSetSpy = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ReleaseNotesService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: StorageService, useValue: { get: storageGetSpy, set: storageSetSpy } },
      ],
    });

    service = TestBed.inject(ReleaseNotesService);
    httpController = TestBed.inject(HttpTestingController);
  };

  afterEach(() => {
    httpController.verify();
    TestBed.resetTestingModule();
  });

  it('should create', () => {
    createService();
    httpController.expectOne('assets/release-notes.json').flush([]);
    expect(service).toBeTruthy();
  });

  it('should start with empty notes', () => {
    createService();
    expect(service.notes()).toEqual([]);
    httpController.expectOne('assets/release-notes.json').flush([]);
  });

  it('should load notes from JSON on construction', () => {
    createService();
    // HttpTestingController.flush() is synchronous — no fakeAsync needed
    httpController.expectOne('assets/release-notes.json').flush(mockNotes);
    expect(service.notes()).toEqual(mockNotes);
  });

  describe('hasUnseenNotes()', () => {
    it('should be false when notes are empty', () => {
      createService(null);
      expect(service.hasUnseenNotes()).toBe(false);
      httpController.expectOne('assets/release-notes.json').flush([]);
    });

    it('should be true when notes loaded and seenVersion differs from appVersion', () => {
      createService('0.0.0');
      httpController.expectOne('assets/release-notes.json').flush(mockNotes);
      expect(service.hasUnseenNotes()).toBe(true);
    });

    it('should be false when seenVersion matches appVersion', () => {
      createService(environment.appVersion);
      httpController.expectOne('assets/release-notes.json').flush(mockNotes);
      expect(service.hasUnseenNotes()).toBe(false);
    });

    it('should be true when seenVersion is null', () => {
      createService(null);
      httpController.expectOne('assets/release-notes.json').flush(mockNotes);
      expect(service.hasUnseenNotes()).toBe(true);
    });
  });

  describe('markAsSeen()', () => {
    it('should persist appVersion to storage', () => {
      createService(null);
      httpController.expectOne('assets/release-notes.json').flush(mockNotes);
      service.markAsSeen();
      expect(storageSetSpy).toHaveBeenCalledWith('release-notes-seen-version', environment.appVersion);
    });

    it('should set hasUnseenNotes to false after calling markAsSeen', () => {
      createService(null);
      httpController.expectOne('assets/release-notes.json').flush(mockNotes);
      expect(service.hasUnseenNotes()).toBe(true);
      service.markAsSeen();
      expect(service.hasUnseenNotes()).toBe(false);
    });
  });
});
