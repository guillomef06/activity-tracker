import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AllianceInfoTabComponent } from './alliance-info-tab.component';
import { AllianceService } from '@app/core/services/alliance.service';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';

describe('AllianceInfoTabComponent', () => {
  let component: AllianceInfoTabComponent;
  let fixture: ComponentFixture<AllianceInfoTabComponent>;
  let allianceService: jasmine.SpyObj<AllianceService>;

  beforeEach(async () => {
    const allianceServiceSpy = jasmine.createSpyObj('AllianceService', ['updateAlliance']);
    allianceServiceSpy.updateAlliance.and.returnValue(Promise.resolve({ error: null }));

    await TestBed.configureTestingModule({
      imports: [AllianceInfoTabComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AllianceService, useValue: allianceServiceSpy },
        provideAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AllianceInfoTabComponent);
    component = fixture.componentInstance;
    allianceService = TestBed.inject(AllianceService) as jasmine.SpyObj<AllianceService>;

    // Set required inputs
    fixture.componentRef.setInput('alliance', { id: '1', name: 'Test Alliance', tag: null, created_at: new Date().toISOString() });
    fixture.componentRef.setInput('membersCount', 5);
    fixture.componentRef.setInput('invitationsCount', 2);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have alliance form', () => {
    expect(component['allianceForm']).toBeDefined();
    expect(component['allianceForm'].get('name')).toBeDefined();
  });

  it('should update form when alliance input changes', () => {
    fixture.componentRef.setInput('alliance', { id: '1', name: 'New Alliance Name', tag: null, created_at: new Date().toISOString() });
    fixture.detectChanges();

    expect(component['allianceForm'].get('name')?.value).toBe('New Alliance Name');
  });

  it('should call updateAlliance on submit', async () => {
    component['allianceForm'].patchValue({ name: 'Updated Name' });

    await component['updateAlliance']();

    expect(allianceService.updateAlliance).toHaveBeenCalledWith({ name: 'Updated Name', tag: null });
  });

  it('should display member and invitation counts', () => {
    expect(component.membersCount()).toBe(5);
    expect(component.invitationsCount()).toBe(2);
  });
});
