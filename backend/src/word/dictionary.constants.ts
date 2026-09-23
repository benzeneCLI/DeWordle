export const DICTIONARY_REDIS_CLIENT = 'DICTIONARY_REDIS_CLIENT';

export const DICTIONARY_MIN_LOOKUP_LENGTH = 4;
export const DICTIONARY_MAX_LOOKUP_LENGTH = 8;

export const DICTIONARY_SET_KEY_PREFIX = 'words:';

export function dictionarySetKey(length: number): string {
  return `${DICTIONARY_SET_KEY_PREFIX}${length}-letter`;
}