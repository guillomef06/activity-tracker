const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { findMissingKeysByLocale } = require('./check-i18n-unused');

describe('findMissingKeysByLocale', () => {
  it('should return nothing when all locales share the same keys', () => {
    // Arrange
    const keysByLocale = {
      fr: ['a.b', 'c'],
      en: ['c', 'a.b'],
    };

    // Act
    const result = findMissingKeysByLocale(keysByLocale);

    // Assert
    assert.deepEqual(result, {});
  });

  it('should report keys missing from a locale when it lacks some keys', () => {
    // Arrange
    const keysByLocale = {
      fr: ['a', 'b'],
      en: ['a'],
    };

    // Act
    const result = findMissingKeysByLocale(keysByLocale);

    // Assert
    assert.deepEqual(result, { en: ['b'] });
  });

  it('should report a key as missing from all other locales when only one locale defines it', () => {
    // Arrange
    const keysByLocale = {
      fr: ['a'],
      en: ['a', 'extra'],
      es: ['a'],
    };

    // Act
    const result = findMissingKeysByLocale(keysByLocale);

    // Assert
    assert.deepEqual(result, { fr: ['extra'], es: ['extra'] });
  });

  it('should report each locale with its own missing keys when deltas go both ways', () => {
    // Arrange
    const keysByLocale = {
      fr: ['a', 'b'],
      en: ['b', 'c'],
    };

    // Act
    const result = findMissingKeysByLocale(keysByLocale);

    // Assert
    assert.deepEqual(result, { fr: ['c'], en: ['a'] });
  });
});
