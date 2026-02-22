import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../environments/environment';
import { StorageService } from './storage.service';

export interface ReleaseEntry {
  type: 'feature' | 'fix' | 'improvement';
  text: { en: string; fr: string; es: string; it: string };
}

export interface ReleaseNote {
  version: string;
  date: string;
  entries: ReleaseEntry[];
}

const SEEN_VERSION_KEY = 'release-notes-seen-version';

@Injectable({
  providedIn: 'root',
})
export class ReleaseNotesService {
  private readonly http = inject(HttpClient);
  private readonly storageService = inject(StorageService);

  private readonly _notes = signal<ReleaseNote[]>([]);
  private readonly _seenVersion = signal<string | null>(this.storageService.get<string>(SEEN_VERSION_KEY));

  readonly notes = this._notes.asReadonly();
  readonly hasUnseenNotes = computed(() => this._notes().length > 0 && this._seenVersion() !== environment.appVersion);

  constructor() {
    this.http
      .get<ReleaseNote[]>('assets/release-notes.json')
      .pipe(takeUntilDestroyed())
      .subscribe(notes => this._notes.set(notes));
  }

  markAsSeen(): void {
    this.storageService.set(SEEN_VERSION_KEY, environment.appVersion);
    this._seenVersion.set(environment.appVersion);
  }
}
