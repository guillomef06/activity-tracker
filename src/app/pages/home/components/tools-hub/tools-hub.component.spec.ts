import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ToolsHubComponent } from './tools-hub.component';

describe('ToolsHubComponent', () => {
  let component: ToolsHubComponent;
  let fixture: ComponentFixture<ToolsHubComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolsHubComponent, TranslateModule.forRoot()],
      providers: [provideAnimations(), provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ToolsHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show tool grid by default', () => {
    expect(component['selectedTool']()).toBeNull();
  });

  it('should open a tool on selection', () => {
    component['selectedTool'].set('gem-calculator');
    expect(component['selectedTool']()).toBe('gem-calculator');
  });

  it('should return to grid on back', () => {
    component['selectedTool'].set('gem-calculator');
    component['selectedTool'].set(null);
    expect(component['selectedTool']()).toBeNull();
  });
});
