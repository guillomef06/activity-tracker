import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-button',
  standalone: true,
  imports: [MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './loading-button.component.html',
  styleUrl: './loading-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingButtonComponent {
  // Inputs
  text = input.required<string>();
  loadingText = input<string>('Loading...');
  loading = input<boolean>(false);
  disabled = input<boolean>(false);
  type = input<'button' | 'submit' | 'reset'>('button');
  color = input<'primary' | 'accent' | 'warn' | undefined>('primary');
  buttonClass = input<string>('');

  // Output
  clicked = output<void>();

  protected handleClick(): void {
    if (!this.loading() && !this.disabled()) {
      this.clicked.emit();
    }
  }
}
