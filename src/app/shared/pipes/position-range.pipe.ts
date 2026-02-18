import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'positionRange',
  standalone: true,
  pure: true,
})
export class PositionRangePipe implements PipeTransform {
  transform(min: number, max: number): string {
    return min === max ? `${min}` : `${min}-${max}`;
  }
}
