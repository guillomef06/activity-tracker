import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SuperAdminServersPage } from './super-admin-servers.page';
import { SupabaseService } from '@app/core/services/supabase.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { provideZonelessChangeDetection } from '@angular/core';

describe('SuperAdminServersPage', () => {
  let component: SuperAdminServersPage;
  let fixture: ComponentFixture<SuperAdminServersPage>;

  beforeEach(async () => {
    // Create a chainable mock for Supabase client
    interface MockQueryBuilder {
      select: ReturnType<typeof vi.fn>;
      order: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
      single: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      then: (resolve: (value: { data: unknown[]; count: number; error: null }) => void) => void;
    }

    const mockQueryBuilder = {} as MockQueryBuilder;
    mockQueryBuilder.select = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.order = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.eq = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.limit = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.single = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.update = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.delete = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.then = resolve => {
      resolve({ data: [], count: 0, error: null });
    };

    const supabaseServiceSpy = {
      client: {
        from: vi.fn().mockReturnValue(mockQueryBuilder),
      },
    };

    await TestBed.configureTestingModule({
      imports: [SuperAdminServersPage, TranslateModule.forRoot()],
      providers: [
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperAdminServersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have an edit form with name and tag fields', () => {
    expect(component['editForm']).toBeDefined();
    expect(component['editForm'].name).toBeDefined();
    expect(component['editForm'].tag).toBeDefined();
  });

  it('should be invalid when name is empty', () => {
    expect(component['editForm']().valid()).toBe(false);
  });

  it('should become valid once a name of sufficient length is set', () => {
    component['editModel'].set({ name: 'Realm of Kings', tag: '' });

    expect(component['editForm']().valid()).toBe(true);
  });

  it('should require the name to be at least 3 characters', () => {
    component['editModel'].set({ name: 'Ab', tag: '' });

    expect(
      component['editForm']
        .name()
        .errors()
        .some(error => error.kind === 'minLength')
    ).toBe(true);
  });

  it('should reject a tag that is not exactly 3 characters', () => {
    component['editModel'].set({ name: 'Realm of Kings', tag: 'AB' });

    expect(
      component['editForm']
        .tag()
        .errors()
        .some(error => error.kind === 'minLength')
    ).toBe(true);
  });

  it('should accept a 3-character tag', () => {
    component['editModel'].set({ name: 'Realm of Kings', tag: 'RoK' });

    expect(component['editForm']().valid()).toBe(true);
  });

  it('should display correct columns', () => {
    expect(component['displayedColumns']).toEqual(['name', 'tag', 'admin', 'members', 'createdAt', 'actions']);
  });
});
