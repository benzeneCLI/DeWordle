import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import {
  DICTIONARY_REDIS_CLIENT,
  DICTIONARY_MIN_LOOKUP_LENGTH,
  DICTIONARY_MAX_LOOKUP_LENGTH,
  dictionarySetKey,
} from './dictionary.constants';

export interface DictionaryWordList {
  [length: string]: string[];
}

const DICTIONARY_JSON_PATH = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'dictionary.json',
);

/**
 * DICTIONARY-1102: Redis-backed word dictionary with a local JSON fallback.
 *
 * Valid words (4-8 letters) are loaded into Redis member sets keyed by length
 * (`words:5-letter`, `words:6-letter`, ...) for O(1) `SISMEMBER` lookups. When
 * Redis is disabled, unreachable, or errors at lookup time the service serves
 * the same data from an in-memory `Set` index built from the bundled JSON
 * dictionary file so word verification never hard-fails.
 */
@Injectable()
export class DictionaryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DictionaryService.name);

  /** In-memory fallback index: word length -> set of valid words. */
  private readonly localIndex: Map<number, Set<string>> = new Map();
  private totalWords = 0;
  private redisReady = false;

  constructor(
    @Inject(DICTIONARY_REDIS_CLIENT)
    private readonly redis: Redis | null,
  ) {}

  async onModuleInit(): Promise<void> {
    this.loadLocalIndex();
    await this.warmRedisCache();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redis) {
      return;
    }
    try {
      await this.redis.quit();
    } catch (error) {
      this.logger.debug(
        `Redis client close ignored: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * O(1) membership check for a single word. Redis `SISMEMBER` is used when
   * the cache is available; otherwise the local `Set` index answers directly.
   */
  async isValidWord(word: string): Promise<boolean> {
    const normalized = this.normalize(word);
    const length = normalized.length;

    if (
      length < DICTIONARY_MIN_LOOKUP_LENGTH ||
      length > DICTIONARY_MAX_LOOKUP_LENGTH
    ) {
      return false;
    }

    if (this.redisReady && this.redis) {
      try {
        const inSet = await this.redis.sismember(
          dictionarySetKey(length),
          normalized,
        );
        return inSet === 1;
      } catch (error) {
        // A transient Redis failure must not break word verification; degrade
        // to the in-memory index for the remainder of the process lifetime.
        this.logger.warn(
          `Redis lookup failed (${this.message(error)}); falling back to local index`,
        );
        this.redisReady = false;
      }
    }

    return this.localIndex.get(length)?.has(normalized) ?? false;
  }

  /** Number of words available for a given word length. */
  wordCountForLength(length: number): number {
    return this.localIndex.get(length)?.size ?? 0;
  }

  /** True when lookups are answered from Redis rather than the local index. */
  isRedisCacheActive(): boolean {
    return this.redisReady;
  }

  private loadLocalIndex(): void {
    if (!fs.existsSync(DICTIONARY_JSON_PATH)) {
      this.logger.error(
        `Dictionary file not found at ${DICTIONARY_JSON_PATH}; word validation will be unavailable`,
      );
      return;
    }

    const raw = JSON.parse(
      fs.readFileSync(DICTIONARY_JSON_PATH, 'utf-8'),
    ) as DictionaryWordList;

    for (const [lengthKey, words] of Object.entries(raw)) {
      const length = Number.parseInt(lengthKey, 10);
      if (!Number.isInteger(length) || Number.isNaN(length)) {
        continue;
      }
      const normalized = words
        .map((word) => this.normalize(word))
        .filter((word) => /^[a-z]+$/.test(word))
        .filter((word) => word.length === length);
      this.localIndex.set(length, new Set(normalized));
      this.totalWords += normalized.length;
    }

    this.logger.log(
      `Loaded ${this.totalWords} words (lengths ${DICTIONARY_MIN_LOOKUP_LENGTH}-${DICTIONARY_MAX_LOOKUP_LENGTH}) from local dictionary file`,
    );
  }

  private async warmRedisCache(): Promise<void> {
    if (!this.redis) {
      this.logger.warn(
        'Redis client disabled; serving lookups from the local dictionary fallback',
      );
      return;
    }

    try {
      await this.redis.connect();
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        throw new Error(`unexpected redis ping response: ${pong}`);
      }

      for (const [length, words] of this.localIndex.entries()) {
        const setKey = dictionarySetKey(length);
        await this.redis.del(setKey);
        if (words.size > 0) {
          await this.redis.sadd(setKey, ...words);
        }
      }

      this.redisReady = true;
      this.logger.log(
        `Loaded ${this.totalWords} words into Redis member sets (words:<n>-letter)`,
      );
    } catch (error) {
      this.logger.warn(
        `Redis unavailable (${this.message(error)}); using local JSON dictionary fallback`,
      );
      this.redisReady = false;
    }
  }

  private normalize(word: string): string {
    return word.trim().toLowerCase();
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}