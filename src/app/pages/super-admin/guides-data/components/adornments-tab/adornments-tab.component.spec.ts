import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AdornmentsTabComponent } from './adornments-tab.component';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { SnackbarService } from '@app/core/services';
import type { Adornment } from '@app/shared/models/guide.model';

const mockAdornment: Adornment = {
  id: 'o1',
  name: 'Golden Shield',
  image_url: null,
  is_active: true,
  sort_order: 1,
};

describe('AdornmentsTabComponent', () => {
  let fixture: ComponentFixture<AdornmentsTabComponent>;
  let component: AdornmentsTabComponent;
  let guideAdminSpy: {
    getAdornments: ReturnType<typeof vi.fn>;
    createAdornment: ReturnType<typeof vi.fn>;
    updateAdornment: ReturnType<typeof vi.fn>;
    deleteAdornment: ReturnType<typeof vi.fn>;
  };
  let snackbarSpy: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialogSpy: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    guideAdminSpy = {
      getAdornments: vi.fn().mockResolvedValue([mockAdornment]),
      createAdornment: vi.fn().mockResolvedValue({ adornment: mockAdornment, error: null }),
      updateAdornment: vi.fn().mockResolvedValue({ error: null }),
      deleteAdornment: vi.fn().mockResolvedValue({ error: null }),
    };
    snackbarSpy = { success: vi.fn(), error: vi.fn() };
    dialogSpy = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };

    await TestBed.configureTestingModule({
      imports: [AdornmentsTabComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: GuideAdminService, useValue: guideAdminSpy },
        { provide: SnackbarService, useValue: snackbarSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
    })
      .overrideComponent(AdornmentsTabComponent, { remove: { imports: [MatDialogModule] } })
      .compileComponents();

    fixture = TestBed.createComponent(AdornmentsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load adornments on init', () => {
    expect(guideAdminSpy.getAdornments).toHaveBeenCalled();
    expect(component['adornments']()).toEqual([mockAdornment]);
  });

  it('should toggle active state', async () => {
    await component['toggleActive'](mockAdornment);

    expect(guideAdminSpy.updateAdornment).toHaveBeenCalledWith('o1', { is_active: false });
  });

  it('should save edited adornment', async () => {
    component['startEdit'](mockAdornment);
    component['editForm'].patchValue({ name: 'Updated', sort_order: 2 });

    await component['save'](mockAdornment);

    expect(guideAdminSpy.updateAdornment).toHaveBeenCalledWith('o1', expect.objectContaining({ name: 'Updated' }));
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should delete adornment after confirmation', async () => {
    await component['delete'](mockAdornment);

    expect(guideAdminSpy.deleteAdornment).toHaveBeenCalledWith('o1');
    expect(snackbarSpy.success).toHaveBeenCalled();
  });
});
