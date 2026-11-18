import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { DataService } from '../../core/data/data.service';
import { RegisterAccountRequest, RegisterableAccountRole, RegistrationMenuOption, Staff } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';

const STRONG_PASSWORD = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,72}$/;

@Component({
  selector: 'app-team',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './team.component.html',
  styleUrl: './team.component.scss',
})
export class TeamComponent implements OnInit {
  private readonly data = inject(DataService);
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly staff = signal<Staff[]>([]);
  readonly menuOptions = signal<RegistrationMenuOption[]>([]);
  readonly loading = signal(true);
  readonly loadingMenus = signal(false);
  readonly menuError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly modalOpen = signal(false);
  readonly editing = signal<Staff | null>(null);
  readonly selectedMenuIds = signal<number[]>([]);
  readonly selectedTabIds = signal<number[]>([]);
  readonly orderTabs = computed(() => {
    const orderMenu = this.menuOptions().find((menu) => menu.title.trim().toLowerCase() === 'orders');
    return orderMenu?.tabs ?? [];
  });
  readonly roleOptions = computed(() => {
    if (this.auth.role() === 'Super Admin') {
      return [
        { value: 'SUPER_ADMIN' as const, label: 'Super Admin' },
        { value: 'ADMIN' as const, label: 'Admin' },
        { value: 'BACKEND_USER' as const, label: 'Backend User' },
      ];
    }
    if (this.auth.role() === 'Admin') {
      return [
        { value: 'ADMIN' as const, label: 'Admin' },
        { value: 'BACKEND_USER' as const, label: 'Backend User' },
      ];
    }
    return [{ value: 'BACKEND_USER' as const, label: 'Backend User' }];
  });

  readonly superAdminCount = computed(() => this.staff().filter((item) => item.role === 'Super Admin').length);
  readonly adminCount = computed(() => this.staff().filter((item) => item.role === 'Admin').length);
  readonly backendCount = computed(() => this.staff().filter((item) => item.role === 'Backend User').length);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    loginId: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(180)]],
    password: ['', [Validators.maxLength(72)]],
    role: ['BACKEND_USER' as RegisterableAccountRole, Validators.required],
    active: [true],
  });

  ngOnInit(): void {
    this.loadStaff();
    this.loadMenus();
    this.form.controls.role.valueChanges.subscribe((role) => this.applyRoleDefaults(role));
  }

  loadStaff(): void {
    this.loading.set(true);
    this.error.set(null);
    this.data.getStaff().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (staff) => this.staff.set(staff),
      error: (error: unknown) => {
        const message = this.errorMessage(error, 'Could not load staff accounts.');
        this.error.set(message);
        this.toast.error(message);
      },
    });
  }

  private loadMenus(): void {
    this.loadingMenus.set(true);
    this.menuError.set(null);
    this.data.getRegistrationMenuOptions().pipe(finalize(() => this.loadingMenus.set(false))).subscribe({
      next: (options) => {
        const excludedTitles = new Set([
          'dashboard', 'settings', 'order history',
          'photo order', 'photo orders', 'photos order', 'photos orders',
        ]);
        const orderMenu = options.find((menu) => menu.title.trim().toLowerCase() === 'orders')
          ?? options.find((menu) => ['new order', 'new orders'].includes(menu.title.trim().toLowerCase()));
        const visibleMenus = options
          .filter((menu) => {
            const title = menu.title.trim().toLowerCase();
            if (excludedTitles.has(title)) return false;
            if (['new order', 'new orders'].includes(title) && orderMenu?.title.trim().toLowerCase() === 'orders') return false;
            return true;
          })
          .map((menu) => menu.id === orderMenu?.id ? { ...menu, title: 'Orders' } : menu);
        this.menuOptions.set(visibleMenus);
        if (this.modalOpen() && !this.selectedMenuIds().length) {
          this.applyRoleDefaults(this.form.controls.role.value);
        }
      },
      error: (error: unknown) => {
        const message = this.errorMessage(error, 'Could not load staff permissions.');
        this.menuError.set(message);
        this.toast.error(message);
      },
    });
  }

  retryMenus(): void {
    this.loadMenus();
  }

  openAdd(): void {
    this.editing.set(null);
    const role: RegisterableAccountRole = this.auth.role() === 'Admin' || this.auth.role() === 'Super Admin'
      ? 'ADMIN'
      : 'BACKEND_USER';
    this.form.reset({ fullName: '', loginId: '', email: '', password: '', role, active: true });
    this.selectedMenuIds.set([]);
    this.selectedTabIds.set([]);
    this.applyRoleDefaults(role);
    this.modalOpen.set(true);
  }

  private applyRoleDefaults(role: RegisterableAccountRole): void {
    const menus = this.menuOptions();
    if (!menus.length) return;
    const defaultTitles = role === 'ADMIN'
      ? ['products', 'customers', 'brands', 'orders']
      : role === 'BACKEND_USER' ? ['orders'] : [];
    const selected = role === 'SUPER_ADMIN'
      ? menus
      : menus.filter((menu) => defaultTitles.includes(menu.title.trim().toLowerCase()));
    this.selectedMenuIds.set(selected.map((menu) => menu.id));
    const orders = selected.find((menu) => menu.title.trim().toLowerCase() === 'orders');
    this.selectedTabIds.set(role === 'ADMIN' || role === 'SUPER_ADMIN' ? (orders?.tabs.map((tab) => tab.id) ?? []) : []);
  }

  openEdit(staff: Staff): void {
    this.editing.set(staff);
    this.form.reset({
      fullName: staff.name,
      loginId: staff.loginId || '',
      email: staff.email,
      password: '',
      role: staff.role === 'Admin' ? 'ADMIN' : staff.role === 'Super Admin' ? 'SUPER_ADMIN' : 'BACKEND_USER',
      active: staff.active,
    });
    this.selectedMenuIds.set([]);
    this.selectedTabIds.set([]);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
    this.editing.set(null);
  }

  toggleMenu(menuId: number, checked: boolean): void {
    this.selectedMenuIds.update((ids) => checked ? [...new Set([...ids, menuId])] : ids.filter((id) => id !== menuId));
    const menu = this.menuOptions().find((item) => item.id === menuId);
    if (!checked) {
      const tabIds = new Set(menu?.tabs.map((tab) => tab.id) ?? []);
      this.selectedTabIds.update((ids) => ids.filter((id) => !tabIds.has(id)));
    } else if (this.form.controls.role.value === 'ADMIN' && menu?.tabs.length) {
      this.selectedTabIds.update((ids) => [...new Set([...ids, ...menu.tabs.map((tab) => tab.id)])]);
    }
  }

  toggleTab(tabId: number, checked: boolean): void {
    this.selectedTabIds.update((ids) => checked ? [...new Set([...ids, tabId])] : ids.filter((id) => id !== tabId));
  }

  hasMenu(menuId: number): boolean { return this.selectedMenuIds().includes(menuId); }
  hasTab(tabId: number): boolean { return this.selectedTabIds().includes(tabId); }

  showMenuTabs(menu: RegistrationMenuOption): boolean {
    return this.form.controls.role.value !== 'BACKEND_USER' && menu.hasTab && menu.tabs.length > 0;
  }

  showAdminOrderTabs(): boolean {
    const orderMenu = this.menuOptions().find((menu) => menu.title.trim().toLowerCase() === 'orders');
    return this.form.controls.role.value === 'ADMIN' && !!orderMenu?.tabs.length &&
      this.selectedMenuIds().includes(orderMenu.id);
  }

  setStatus(value: string): void {
    this.form.controls.active.setValue(value === 'ACTIVE');
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const password = value.password;
    const current = this.editing();

    if (!current && !STRONG_PASSWORD.test(password)) {
      this.toast.error('Password needs 8+ characters with uppercase, lowercase, number and symbol.');
      return;
    }
    if (current && password && !STRONG_PASSWORD.test(password)) {
      this.toast.error('New password needs 8+ characters with uppercase, lowercase, number and symbol.');
      return;
    }
    if (!current && this.selectedMenuIds().length === 0) {
      this.toast.error('Select at least one allowed feature for this account.');
      return;
    }

    this.saving.set(true);
    if (current) {
      const updated: Staff = {
        ...current,
        name: value.fullName.trim(),
        loginId: value.loginId.trim(),
        email: value.email.trim(),
        active: value.active,
      };
      this.data.updateStaffAccount(updated, password).pipe(finalize(() => this.saving.set(false))).subscribe({
        next: (saved) => {
          this.staff.update((rows) => rows.map((row) => row.id === saved.id ? saved : row));
          this.toast.success('Staff credentials updated successfully.');
          this.closeAfterSave();
        },
        error: (error: unknown) => this.toast.error(this.errorMessage(error, 'Could not update staff credentials.')),
      });
      return;
    }

    const payload: RegisterAccountRequest = {
      fullName: value.fullName.trim(),
      loginId: value.loginId.trim(),
      email: value.email.trim(),
      password,
      role: value.role,
      status: value.active ? 'ACTIVE' : 'INACTIVE',
      menus: this.selectedMenuIds(),
      orderTabs: this.selectedTabIds(),
    };
    this.data.registerAccount(payload).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.toast.success('Staff account created successfully.');
        this.closeAfterSave();
        this.loadStaff();
      },
      error: (error: unknown) => this.toast.error(this.errorMessage(error, 'Could not create staff account.')),
    });
  }

  private closeAfterSave(): void {
    this.modalOpen.set(false);
    this.editing.set(null);
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
  }
}
