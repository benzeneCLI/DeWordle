import { Module } from '@nestjs/common';
import { AdminQueuesController } from './admin-queues.controller';
import { AdminDlqController } from './dlq.controller';
import { JobModule } from '../common/job.module';

@Module({
  imports: [JobModule],
  controllers: [AdminQueuesController, AdminDlqController],
})
export class AdminModule {}
