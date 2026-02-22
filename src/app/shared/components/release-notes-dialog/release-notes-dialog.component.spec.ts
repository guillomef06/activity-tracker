import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal, computed } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { ReleaseNotesDialogComponent } from './release-notes-dialog.component';
import { ReleaseNotesService, ReleaseNote } from '@app/core/services/release-notes.service';
import { LanguageService } from '@app/core/services/language.service';

describe('ReleaseNotesDialogComponent', () => {
  let component: ReleaseNotesDialogComponent;
  let fixture: ComponentFixture<ReleaseNotesDialogComponent>;
  let dialogCloseSpy: ReturnType<typeof vi.fn>;
  let markAsSeenSpy: ReturnType<typeof vi.fn>;

  const sampleNotes: ReleaseNote[] = [
    {
      version: '1.0.0',
      date: '2026-02-22',
      entries: [
        { type: 'feature', text: { en: 'Feature A', fr: 'Fonctionnalité A', es: 'Función A', it: 'Funzionalità A' } },
        { type: 'fix', text: { en: 'Fix B', fr: 'Correction B', es: 'Corrección B', it: 'Correzione B' } },
      ],
    },
  ];

  const createComponent = async (hasUnseen = true, notes: ReleaseNote[] = sampleNotes) => {
    dialogCloseSpy = vi.fn();
    markAsSeenSpy = vi.fn();

    const notesSignal = signal(notes);
    const hasUnseenSignal = computed(() => hasUnseen);

    const releaseNotesServiceMock = {
      notes: notesSignal.asReadonly(),
      hasUnseenNotes: hasUnseenSignal,
      markAsSeen: markAsSeenSpy,
    };

    const languageServiceMock = {
      currentLanguage: signal<'en' | 'fr' | 'es' | 'it'>('en').asReadonly(),
    };

    const dialogRefMock = {
      close: dialogCloseSpy,
    };

    await TestBed.configureTestingModule({
      imports: [ReleaseNotesDialogComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        { provide: ReleaseNotesService, useValue: releaseNotesServiceMock },
        { provide: LanguageService, useValue: languageServiceMock },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReleaseNotesDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it('should display notes entries', async () => {
    await createComponent();
    const entries = fixture.nativeElement.querySelectorAll('.entry');
    expect(entries.length).toBe(2);
  });

  it('should display entry text in current language (en)', async () => {
    await createComponent();
    const entries = fixture.nativeElement.querySelectorAll('.entry span:last-child');
    expect(entries[0].textContent.trim()).toBe('Feature A');
    expect(entries[1].textContent.trim()).toBe('Fix B');
  });

  it('should close dialog when close button is clicked', async () => {
    await createComponent();
    const closeButton = fixture.nativeElement.querySelector('button[mat-button]');
    closeButton?.click();
    expect(dialogCloseSpy).toHaveBeenCalledTimes(1);
  });

  it('should show "Mark as read" button when hasUnseenNotes is true', async () => {
    await createComponent(true);
    const markButton = fixture.nativeElement.querySelector('button[mat-flat-button]');
    expect(markButton).not.toBeNull();
  });

  it('should hide "Mark as read" button when hasUnseenNotes is false', async () => {
    await createComponent(false);
    const markButton = fixture.nativeElement.querySelector('button[mat-flat-button]');
    expect(markButton).toBeNull();
  });

  it('should call markAsSeen and close dialog when "Mark as read" is clicked', async () => {
    await createComponent(true);
    const markButton = fixture.nativeElement.querySelector('button[mat-flat-button]');
    markButton?.click();
    expect(markAsSeenSpy).toHaveBeenCalledTimes(1);
    expect(dialogCloseSpy).toHaveBeenCalledTimes(1);
  });
});
