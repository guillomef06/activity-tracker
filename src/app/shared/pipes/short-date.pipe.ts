import { Pipe, PipeTransform } from '@angular/core';
import { formatShortDate } from '../utils/date.util';

@Pipe({
  name: 'shortDate',
  standalone: true,
  pure: true,
})
export class ShortDatePipe implements PipeTransform {
  transform(date: Date): string {
    return formatShortDate(date);
  }
}
