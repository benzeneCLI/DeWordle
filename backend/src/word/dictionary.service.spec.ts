import { Test, TestingModule } from '@nestjs/testing';
import {
  DictionaryService,
} from './dictionary.service';
import { DICTIONARY_REDIS_CLIENT } from './dictionary.constants';

type RedisLike = {
  connect: jest.Mock;
  ping: jest.Mock;
  del: jest.Mock;
  sadd: jest.Mock;
  sismember: jest.Mock;
  quit: jest.Mock;
};

function createMockRedis(): RedisLike {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    del: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    sismember: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue(undefined),
  };
}

describe('DictionaryService', () => {
  let service: DictionaryService;
  let mockRedis: RedisLike;
  let module: TestingModule;

  describe('with Redis available', () => {
    beforeEach(async () => {
      mockRedis = createMockRedis();
      module = await Test.createTestingModule({
        providers: [
          DictionaryService,
          {
            provide: DICTIONARY_REDIS_CLIENT,
            useValue: mockRedis,
          },
        ],
      }).compile();

      service = module.get(DictionaryService);
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('loads words into length-keyed Redis member sets on init', () => {
      expect(mockRedis.ping).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith('words:5-letter');
      const saddCall = mockRedis.sadd.mock.calls.find(
        (call) => call[0] === 'words:5-letter',
      );
      expect(saddCall).toBeDefined();
      expect(saddCall!.length).toBe(2187); // key + 2186 five-letter words
      expect(service.isRedisCacheActive()).toBe(true);
    });

    it('answers isValidWord via Redis SISMEMBER (O(1))', async () => {
      mockRedis.sismember.mockResolvedValue(1);
      await expect(service.isValidWord('APPLE')).resolves.toBe(true);
      expect(mockRedis.sismember).toHaveBeenCalledWith(
        'words:5-letter',
        'apple',
      );

      mockRedis.sismember.mockResolvedValue(0);
      await expect(service.isValidWord('zzzzz')).resolves.toBe(false);
    });

    it('falls back to the local index when a Redis lookup fails', async () => {
      mockRedis.sismember.mockRejectedValue(new Error('socket closed'));

      await expect(service.isValidWord('apple')).resolves.toBe(true);
      await expect(service.isValidWord('notaword')).resolves.toBe(false);
      expect(service.isRedisCacheActive()).toBe(false);
    });
  });

  describe('with Redis disabled (null client)', () => {
    beforeEach(async () => {
      module = await Test.createTestingModule({
        providers: [
          DictionaryService,
          {
            provide: DICTIONARY_REDIS_CLIENT,
            useValue: null,
          },
        ],
      }).compile();

      service = module.get(DictionaryService);
      await service.onModuleInit();
    });

    it('serves lookups from the local JSON dictionary', async () => {
      expect(service.isRedisCacheActive()).toBe(false);
      await expect(service.isValidWord('apple')).resolves.toBe(true);
      await expect(service.isValidWord('baker')).resolves.toBe(true);
    });

    it('rejects words absent from the dictionary', async () => {
      await expect(service.isValidWord('zzzzz')).resolves.toBe(false);
      await expect(service.isValidWord('xyzzy')).resolves.toBe(false);
    });

    it('normalizes case and surrounding whitespace', async () => {
      await expect(service.isValidWord('  APPLE ')).resolves.toBe(true);
    });

    it('rejects words outside the 4-8 letter range', async () => {
      await expect(service.isValidWord('ab')).resolves.toBe(false);
      await expect(service.isValidWord('banana!')).resolves.toBe(false); // 7 chars + punctuation
      await expect(service.isValidWord('abcdefghi')).resolves.toBe(false);
    });

    it('reports per-length word counts', () => {
      expect(service.wordCountForLength(5)).toBe(2186);
      expect(service.wordCountForLength(4)).toBe(22);
      expect(service.wordCountForLength(8)).toBe(0);
      expect(service.wordCountForLength(12)).toBe(0);
    });
  });

  describe('with Redis unreachable at startup', () => {
    beforeEach(async () => {
      mockRedis = createMockRedis();
      mockRedis.connect.mockRejectedValue(new Error('connect ECONNREFUSED'));

      module = await Test.createTestingModule({
        providers: [
          DictionaryService,
          {
            provide: DICTIONARY_REDIS_CLIENT,
            useValue: mockRedis,
          },
        ],
      }).compile();

      service = module.get(DictionaryService);
      await service.onModuleInit();
    });

    it('degrades gracefully to the local JSON fallback', async () => {
      expect(service.isRedisCacheActive()).toBe(false);
      expect(mockRedis.sadd).not.toHaveBeenCalled();
      await expect(service.isValidWord('apple')).resolves.toBe(true);
      await expect(service.isValidWord('zzzzz')).resolves.toBe(false);
    });
  });
});