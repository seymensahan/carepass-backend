import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AppwriteService } from '../common/services/appwrite.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AppwriteService],
  exports: [UsersService],
})
export class UsersModule {}
