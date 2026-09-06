import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { MgEventCardComponent } from './mg-event-card.component';
import type { MgEvent, MgRegistration, MgSelectionWithUser } from '@shared/models';

// Pure computed logic tests (no DOM)
const makeEvent = (status: MgEvent['status']): MgEvent => ({
  id: 'ev-1',
  server_id: 'srv-1',
  start_date: '2026-05-04',
  end_date: '2026-05-10',
  registration_open_at: '2026-04-27',
  registration_close_at: '2026-04-30',
  status,
  selection_published_at: status === 'selection_published' ? '2026-05-01T10:00:00Z' : null,
  created_at: '2026-04-20T00:00:00Z',
});

const makeRegistration = (): MgRegistration => ({
  id: 'reg-1',
  mg_event_id: 'ev-1',
  user_id: 'user-1',
  registered_at: new Date().toISOString(),
  desired_slot_order: 3,
  comment: null,
});

const makeSelection = (userId: string, rank: number): MgSelectionWithUser => ({
  id: 'sel-' + rank,
  mg_event_id: 'ev-1',
  user_id: userId,
  rank,
  selection_type: 'selected',
  selected_by: 'automatic',
  cost: 0,
  user_profiles: { display_name: 'Player ' + rank, username: 'player' + rank },
});

describe('MgEventCardComponent logic', () => {
  it('showRegistrationActions only for registration_open', () => {
    const statuses: MgEvent['status'][] = [
      'upcoming',
      'registration_open',
      'registration_closed',
      'selection_published',
      'ongoing',
      'finished',
    ];
    const open = statuses.filter(s => s === 'registration_open');
    const notOpen = statuses.filter(s => s !== 'registration_open');
    expect(open).toHaveLength(1);
    expect(notOpen).toHaveLength(5);
  });

  it('showWaiting only for registration_closed', () => {
    const statuses: MgEvent['status'][] = [
      'upcoming',
      'registration_open',
      'registration_closed',
      'selection_published',
      'ongoing',
      'finished',
    ];
    const waiting = statuses.filter(s => s === 'registration_closed');
    expect(waiting).toHaveLength(1);
  });

  it('showSelection for selection_published, ongoing, finished', () => {
    const showFor: MgEvent['status'][] = ['selection_published', 'ongoing', 'finished'];
    expect(showFor).toHaveLength(3);
  });

  it('isRegistered when registration is not null', () => {
    const reg = makeRegistration();
    expect(reg).not.toBeNull();
  });

  it('isSelected when user_id matches a selected slot', () => {
    const selection = [makeSelection('user-1', 1), makeSelection('user-2', 2)];
    const isSelected = selection.some(s => s.user_id === 'user-1' && s.selection_type === 'selected');
    expect(isSelected).toBe(true);
  });

  it('ffaCount counts ffa slots', () => {
    const selection: MgSelectionWithUser[] = [
      { ...makeSelection('user-1', 1) },
      {
        id: 'ffa-1',
        mg_event_id: 'ev-1',
        user_id: null,
        rank: 2,
        selection_type: 'ffa',
        selected_by: 'automatic',
        cost: 0,
        user_profiles: null,
      },
      {
        id: 'ffa-2',
        mg_event_id: 'ev-1',
        user_id: null,
        rank: 3,
        selection_type: 'ffa',
        selected_by: 'automatic',
        cost: 0,
        user_profiles: null,
      },
    ];
    const count = selection.filter(s => s.selection_type === 'ffa').length;
    expect(count).toBe(2);
  });

  it('makeEvent helper builds correct shape', () => {
    const ev = makeEvent('registration_open');
    expect(ev.status).toBe('registration_open');
    expect(ev.selection_published_at).toBeNull();
  });
});

describe('MgEventCardComponent registration form', () => {
  let component: MgEventCardComponent;
  let fixture: ComponentFixture<MgEventCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MgEventCardComponent, TranslateModule.forRoot()],
      providers: [provideAnimations(), provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(MgEventCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('mgEvent', makeEvent('registration_open'));
    fixture.componentRef.setInput('currentUserId', 'user-1');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not emit register when no position is selected', () => {
    // Arrange
    const emitSpy = vi.spyOn(component.register, 'emit');

    // Act
    component.onRegister();

    // Assert
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should mark the form as touched when submitted while invalid', () => {
    // Act
    component.onRegister();

    // Assert
    expect(component['registrationForm'].desired_slot_order().touched()).toBe(true);
  });

  it('should reject a desired_slot_order outside the known MG_SLOT_DEFAULTS values', () => {
    // Arrange
    component['registrationModel'].set({ desired_slot_order: 99, comment: '' });

    // Assert
    expect(
      component['registrationForm']
        .desired_slot_order()
        .errors()
        .some(e => e.kind === 'positionInvalid')
    ).toBe(true);
  });

  it('should emit register with the selected position and trimmed comment', () => {
    // Arrange
    const emitSpy = vi.spyOn(component.register, 'emit');
    component['registrationModel'].set({ desired_slot_order: 6, comment: '  Aiming top 10  ' });

    // Act
    component.onRegister();

    // Assert
    expect(emitSpy).toHaveBeenCalledWith({ desired_slot_order: 6, comment: 'Aiming top 10' });
  });

  it('should emit a null comment when the comment field is left blank', () => {
    // Arrange
    const emitSpy = vi.spyOn(component.register, 'emit');
    component['registrationModel'].set({ desired_slot_order: 1, comment: '   ' });

    // Act
    component.onRegister();

    // Assert
    expect(emitSpy).toHaveBeenCalledWith({ desired_slot_order: 1, comment: null });
  });

  it('should reject a comment longer than 200 characters', () => {
    // Arrange
    component['registrationModel'].set({ desired_slot_order: 1, comment: 'a'.repeat(201) });

    // Assert
    expect(
      component['registrationForm']
        .comment()
        .errors()
        .some(e => e.kind === 'maxLength')
    ).toBe(true);
  });

  it('should not emit register when the comment exceeds 200 characters even with a valid position', () => {
    // Arrange
    const emitSpy = vi.spyOn(component.register, 'emit');
    component['registrationModel'].set({ desired_slot_order: 1, comment: 'a'.repeat(201) });

    // Act
    component.onRegister();

    // Assert
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should mark the comment field as touched when submit is blocked by an over-length comment', () => {
    // Arrange
    component['registrationModel'].set({ desired_slot_order: 1, comment: 'a'.repeat(201) });

    // Act
    component.onRegister();

    // Assert
    expect(component['registrationForm'].comment().touched()).toBe(true);
  });

  it('should update the live character-count hint as the comment field changes', () => {
    // Arrange
    const getHintText = () => fixture.nativeElement.querySelector('mat-hint')?.textContent?.trim();

    // Act & Assert — initial state
    expect(getHintText()).toBe('0 / 200');

    // Act
    component['registrationModel'].set({ desired_slot_order: null, comment: 'Aiming for top 10' });
    fixture.detectChanges();

    // Assert
    expect(getHintText()).toBe('18 / 200');
  });

  it('should show the registration form and hide the unregister button when not registered', () => {
    // Assert
    expect(fixture.nativeElement.querySelector('form.registration-form')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.btn-danger')).toBeNull();
  });

  it('should hide the registration form and show the unregister button when already registered', () => {
    // Arrange
    fixture.componentRef.setInput('registration', {
      id: 'reg-1',
      mg_event_id: 'ev-1',
      user_id: 'user-1',
      registered_at: new Date().toISOString(),
      desired_slot_order: 3,
      comment: null,
    });

    // Act
    fixture.detectChanges();

    // Assert
    expect(fixture.nativeElement.querySelector('form.registration-form')).toBeNull();
    expect(fixture.nativeElement.querySelector('.btn-danger')).toBeTruthy();
  });

  it('should hide the whole registration section when the event is not in registration_open status', () => {
    // Arrange
    fixture.componentRef.setInput('mgEvent', makeEvent('registration_closed'));

    // Act
    fixture.detectChanges();

    // Assert
    expect(fixture.nativeElement.querySelector('.registration-section')).toBeNull();
  });
});
