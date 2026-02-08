import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MembersTabComponent } from './members-tab.component';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';

describe('MembersTabComponent', () => {
  let component: MembersTabComponent;
  let fixture: ComponentFixture<MembersTabComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MembersTabComponent, TranslateModule.forRoot()],
      providers: [provideAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(MembersTabComponent);
    component = fixture.componentInstance;
    
    // Set required inputs
    fixture.componentRef.setInput('members', []);
    fixture.componentRef.setInput('isLoading', false);
    
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display empty state when no members', () => {
    expect(component.members().length).toBe(0);
  });

  it('should display members when provided', () => {
    const mockMembers = [
      { id: '1', display_name: 'User 1', username: 'user1', role: 'admin', created_at: new Date().toISOString() },
      { id: '2', display_name: 'User 2', username: 'user2', role: 'member', created_at: new Date().toISOString() },
    ];
    
    fixture.componentRef.setInput('members', mockMembers);
    fixture.detectChanges();
    
    expect(component.members().length).toBe(2);
  });

  it('should format date correctly', () => {
    const date = '2024-01-15T10:00:00Z';
    const formatted = component['formatDate'](date);
    
    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe('string');
  });

  it('should return correct role badge class', () => {
    expect(component['getRoleBadgeClass']('admin')).toBe('role-admin');
    expect(component['getRoleBadgeClass']('member')).toBe('role-member');
    expect(component['getRoleBadgeClass']('unknown')).toBe('');
  });
});
