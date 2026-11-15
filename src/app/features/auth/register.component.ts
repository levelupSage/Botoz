import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import {
  RegisterableAccountRole,
  RegisterAccountRequest,
  RegistrationMenuOption,
} from '../../core/models';
import { DataService } from '../../core/data/data.service';
import { AuthService } from '../../core/services/auth.service';

const STRONG_PASSWORD = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,72}$/;

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);

  readonly currentRole = this.auth.role;
  readonly canCreateElevatedAccounts = computed(() => this.currentRole() === 'Super Admin');
  readonly roles = computed<{ value: RegisterableAccountRole; label: string }[]>(() => [
    ...(this.canCreateElevatedAccounts() ? [{ value: 'SUPER_ADMIN' as const, label: 'Super Admin' }] : []),
    ...(this.canCreateElevatedAccounts() ? [{ value: 'ADMIN' as const, label: 'Admin' }] : []),
    { value: 'BACKEND_USER', label: 'Backend User' },
    { value: 'USER', label: 'User' },
  ]);

  readonly loadingOptions = signal(true);
  readonly saving = signal(false);
  readonly menuOptions = signal<RegistrationMenuOption[]>([]);
  readonly selectedMenuIds = signal<number[]>([]);
  readonly selectedTabIds = signal<number[]>([]);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    loginId: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(180)]],
    role: ['BACKEND_USER' as RegisterableAccountRole, Validators.required],
    password: ['', [Validators.required, Validators.pattern(STRONG_PASSWORD)]],
    confirmPassword: ['', Validators.required],
    active: [true],
  });

  ngOnInit(): void {
    this.data.getRegistrationMenuOptions().pipe(
      finalize(() => this.loadingOptions.set(false)),
    ).subscribe({
      next: (options) => this.menuOptions.set(options),
      error: (error: unknown) => this.error.set(error instanceof Error ? error.message : 'Could not load access menus.'),
    });
  }

  isMenuSelected(id: number): boolean {
    return this.selectedMenuIds().includes(id);
  }

  isTabSelected(id: number): boolean {
    return this.selectedTabIds().includes(id);
  }

  toggleMenu(id: number, checked: boolean): void {
    this.selectedMenuIds.update((ids) => checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id));
    if (!checked) {
      const menu = this.menuOptions().find((item) => item.id === id);
      const tabIds = new Set(menu?.tabs.map((tab) => tab.id) ?? []);
      this.selectedTabIds.update((ids) => ids.filter((tabId) => !tabIds.has(tabId)));
    }
  }

  toggleTab(id: number, checked: boolean): void {
    this.selectedTabIds.update((ids) => checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id));
  }

  submit(): void {
    this.error.set(null);
    this.success.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.form.controls.password.value !== this.form.controls.confirmPassword.value) {
      this.error.set('Passwords do not match.');
      this.form.controls.confirmPassword.markAsTouched();
      return;
    }
    if (this.selectedMenuIds().length === 0) {
      this.error.set('Select at least one menu for this account.');
      return;
    }

    this.saving.set(true);
    const value = this.form.getRawValue();
    const payload: RegisterAccountRequest = {
      fullName: value.fullName.trim(),
      loginId: value.loginId.trim(),
      email: value.email.trim(),
      password: value.password,
      role: value.role,
      status: value.active ? 'ACTIVE' : 'INACTIVE',
      menus: this.selectedMenuIds(),
      orderTabs: this.selectedTabIds(),
    };
    this.data.registerAccount(payload).pipe(
      finalize(() => this.saving.set(false)),
    ).subscribe({
      next: () => {
        this.success.set('Account created successfully. The user can now sign in.');
        this.form.reset({
          fullName: '', loginId: '', email: '', role: 'BACKEND_USER', password: '', confirmPassword: '', active: true,
        });
        this.selectedMenuIds.set([]);
        this.selectedTabIds.set([]);
      },
      error: (error: unknown) => this.error.set(error instanceof Error ? error.message : 'Account could not be created.'),
    });
  }
}
