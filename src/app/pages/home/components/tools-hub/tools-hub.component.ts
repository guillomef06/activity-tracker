import { Component, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { GemCalculatorComponent } from './gem-calculator/gem-calculator.component';
import { PackValueCalculatorComponent } from './pack-value-calculator/pack-value-calculator.component';

type ToolId = 'gem-calculator' | 'pack-value-calculator';

interface Tool {
  id: ToolId;
  icon: string;
  titleKey: string;
  descKey: string;
}

@Component({
  selector: 'app-tools-hub',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslateModule,
    GemCalculatorComponent,
    PackValueCalculatorComponent,
  ],
  templateUrl: './tools-hub.component.html',
  styleUrl: './tools-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolsHubComponent {
  protected readonly selectedTool = signal<ToolId | null>(null);

  protected readonly tools: Tool[] = [
    {
      id: 'gem-calculator',
      icon: 'diamond',
      titleKey: 'gemCalculator.title',
      descKey: 'tools.gemCalcDesc',
    },
    {
      id: 'pack-value-calculator',
      icon: 'inventory_2',
      titleKey: 'packValue.title',
      descKey: 'packValue.description',
    },
  ];

  protected readonly currentTool = computed(() => this.tools.find(t => t.id === this.selectedTool()) ?? null);
}
