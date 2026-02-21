import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { getWeekLabel } from '../utils/date.util';

@Pipe({
  name: 'weekLabel',
  pure: true,
})
export class WeekLabelPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(weekIndex: number): string {
    return getWeekLabel(weekIndex, this.translate);
  }
}
