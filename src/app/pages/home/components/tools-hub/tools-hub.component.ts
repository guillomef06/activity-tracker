import { Component, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { GemCalculatorComponent } from './gem-calculator/gem-calculator.component';
import { PackValueCalculatorComponent } from './pack-value-calculator/pack-value-calculator.component';

type ToolId = 'gem-calculator' | 'pack-value-calculator';

interface Tool {
  id: ToolId | string;
  icon: string;
  titleKey: string;
  descKey: string;
  externalUrl?: string;
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
    {
      id: 'horse-traits',
      icon: 'open_in_new',
      titleKey: 'tools.horseTraitsTitle',
      descKey: 'tools.horseTraitsDesc',
      externalUrl: 'https://sombrero16.github.io/horse-traits/',
    },
    {
      id: 'mount-breeding',
      icon: 'menu_book',
      titleKey: 'tools.mountBreedingTitle',
      descKey: 'tools.mountBreedingDesc',
      externalUrl: 'https://aoem.vercel.app/guide',
    },
  ];

  protected readonly currentTool = computed(() => this.tools.find(t => t.id === this.selectedTool()) ?? null);

  protected openTool(tool: Tool): void {
    if (tool.externalUrl) {
      window.open(tool.externalUrl, '_blank', 'noopener,noreferrer');
    } else {
      this.selectedTool.set(tool.id as ToolId);
    }
  }
}
