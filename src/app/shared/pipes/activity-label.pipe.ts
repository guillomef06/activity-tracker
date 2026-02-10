import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { APP_CONSTANTS } from '../constants/constants';

/**
 * ActivityLabelPipe
 * Translates activity type values to their localized labels
 * Usage: {{ activityType | activityLabel }}
 */
@Pipe({
  name: 'activityLabel',
  standalone: true,
  pure: false // Need to re-evaluate when language changes
})
export class ActivityLabelPipe implements PipeTransform {
  private translate = inject(TranslateService);

  transform(activityType: string): string {
    const activity = APP_CONSTANTS.ACTIVITY_TYPES.find(t => t.value === activityType);
    const labelKey = activity?.labelKey || activityType;
    return this.translate.instant(labelKey);
  }
}
