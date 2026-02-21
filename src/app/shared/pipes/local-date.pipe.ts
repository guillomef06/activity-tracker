import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'localDate',
  pure: true,
})
export class LocalDatePipe implements PipeTransform {
  transform(date: string | Date): string {
    return new Date(date).toLocaleDateString();
  }
}
