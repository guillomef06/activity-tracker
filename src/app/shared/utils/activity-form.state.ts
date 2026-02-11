import { signal, computed } from '@angular/core';
import { APP_CONSTANTS } from '../constants/constants';
import { getWeekNumberForWeeksAgo, getDateForWeeksAgo, getWeekStart, getWeekEnd, getWeekLabel } from './date.util';
import { TranslateService } from '@ngx-translate/core';

export interface ActivityFormStateConfig {
  initialMember?: string;
  initialWeeksAgo?: number;
  translate: TranslateService;
  weekLabelPrefix?: string;
}

export function useActivityFormState(config: ActivityFormStateConfig) {
  // Signals
  const selectedMember = signal<string>(config.initialMember ?? '');
  const selectedWeeksAgo = signal<number>(config.initialWeeksAgo ?? 0);
  const selectedActivity = signal<string>('');
  const position = signal<number>(1);
  const isSubmitting = signal<boolean>(false);
  const weekOptions = computed(() => {
    const options = [];
    for (let i = 0; i <= 5; i++) {
      const date = getDateForWeeksAgo(i);
      const weekStart = getWeekStart(date);
      const weekEnd = getWeekEnd(date);
      const label = i === 0
        ? config.translate.instant('alliance.retroactive.currentWeek')
        : config.translate.instant('alliance.retroactive.weeksAgo').replace('{{count}}', i.toString());
      options.push({
        value: i,
        label,
        dateRange: `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`
      });
    }
    return options;
  });

  // Week labels (for dropdowns)
  const weekLabels = computed(() =>
    weekOptions().map(week => getWeekLabel(week.value, config.translate))
  );

  // Activities filtered by week
  const availableActivities = computed(() => {
    const weekNumber = getWeekNumberForWeeksAgo(selectedWeeksAgo());
    return APP_CONSTANTS.ACTIVITY_TYPES.filter(type => type.availableWeeks.includes(weekNumber));
  });

  return {
    selectedMember,
    selectedWeeksAgo,
    selectedActivity,
    position,
    isSubmitting,
    weekOptions,
    weekLabels,
    availableActivities,
  };
}
