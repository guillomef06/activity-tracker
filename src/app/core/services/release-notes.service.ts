import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { rxResource } from '@angular/core/rxjs-interop';
import { environment } from '../../../environments/environment';
import { StorageService } from './storage.service';
import type { SupportedLanguage } from './language.service';

export interface ReleaseEntry {
  type: 'feature' | 'fix' | 'improvement';
  text: Partial<Record<SupportedLanguage, string>> & { en: string };
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

  private readonly _seenVersion = signal<string | null>(this.storageService.get<string>(SEEN_VERSION_KEY));

  private readonly notesResource = rxResource({
    stream: () => this.http.get<ReleaseNote[]>('assets/release-notes.json'),
  });

  readonly notes = computed(() => this.notesResource.value() ?? []);
  readonly hasUnseenNotes = computed(() => this.notes().length > 0 && this._seenVersion() !== environment.appVersion);

  markAsSeen(): void {
    this.storageService.set(SEEN_VERSION_KEY, environment.appVersion);
    this._seenVersion.set(environment.appVersion);
  }
}
