import { describe, expect, it } from 'vitest';
import ar from '../../../assets/i18n/ar.json';
import de from '../../../assets/i18n/de.json';
import el from '../../../assets/i18n/el.json';
import en from '../../../assets/i18n/en.json';
import es from '../../../assets/i18n/es.json';
import fr from '../../../assets/i18n/fr.json';
import hi from '../../../assets/i18n/hi.json';
import id from '../../../assets/i18n/id.json';
import itLocale from '../../../assets/i18n/it.json';
import ko from '../../../assets/i18n/ko.json';
import ku from '../../../assets/i18n/ku.json';
import pt from '../../../assets/i18n/pt.json';
import tr from '../../../assets/i18n/tr.json';
import zh from '../../../assets/i18n/zh.json';
import { APP_CONSTANTS, getActivityTypePoints } from './constants';

const LOCALES: Record<string, unknown> = {
  ar,
  de,
  el,
  en,
  es,
  fr,
  hi,
  id,
  it: itLocale,
  ko,
  ku,
  pt,
  tr,
  zh,
};

function resolveKey(translations: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], translations);
}

describe('APP_CONSTANTS.ACTIVITY_TYPES', () => {
  it('should have unique values', () => {
    // Arrange
    const values = APP_CONSTANTS.ACTIVITY_TYPES.map(t => t.value);

    // Act
    const uniqueCount = new Set(values).size;

    // Assert
    expect(uniqueCount).toBe(values.length);
  });

  it('should include stormlands with its fallback points', () => {
    // Act
    const stormlands = APP_CONSTANTS.ACTIVITY_TYPES.find(t => t.value === 'stormlands');

    // Assert
    expect(stormlands).toEqual({
      value: 'stormlands',
      labelKey: 'activities.types.stormlands',
      points: 8,
    });
    expect(getActivityTypePoints('stormlands')).toBe(8);
  });

  it('should return 0 points when the activity type is unknown', () => {
    expect(getActivityTypePoints('unknown')).toBe(0);
  });

  it('should have a string translation in every locale when an activity type is declared', () => {
    for (const [locale, translations] of Object.entries(LOCALES)) {
      for (const { labelKey } of APP_CONSTANTS.ACTIVITY_TYPES) {
        expect(typeof resolveKey(translations, labelKey), `${locale} → ${labelKey}`).toBe('string');
      }
    }
  });
});
