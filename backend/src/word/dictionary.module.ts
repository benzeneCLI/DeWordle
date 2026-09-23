import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { DICTIONARY_REDIS_CLIENT } from './dictionary.constants';
import { DictionaryService } from './dictionary.service';

@Module({
  providers: [
    // DICTIONARY-1102: Redis is an optional dependency. When the store is
    // disabled or unavailable the service transparently serves lookups from
    // the bundled local JSON dictionary (see dictionary.service.ts).
    {
      provide: DICTIONARY_REDIS_CLIENT,
      useFactory: (): Redis | null => {
        if (process.env.DICTIONARY_REDIS_DISABLED === 'true') {
          return null;
        }
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          // Fail fast instead of retrying forever so startup can degrade to
          // the local JSON fallback promptly.
          retryStrategy: () => null,
        });
      },
    },
    DictionaryService,
  ],
  exports: [DictionaryService],
})
export class DictionaryModule {}