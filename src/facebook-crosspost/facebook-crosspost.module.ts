import { Module } from '@nestjs/common';
import { FacebookCrosspostService } from './facebook-crosspost.service';

@Module({
  providers: [FacebookCrosspostService],
  exports: [FacebookCrosspostService],
})
export class FacebookCrosspostModule {}
