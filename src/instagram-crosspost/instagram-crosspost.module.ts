import { Module } from '@nestjs/common';
import { InstagramCrosspostService } from './instagram-crosspost.service';

@Module({
  providers: [InstagramCrosspostService],
  exports: [InstagramCrosspostService],
})
export class InstagramCrosspostModule {}
