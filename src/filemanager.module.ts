import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FileManagerController } from './filemanager.controller';
import { FileManagerService } from './filemanager.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [FileManagerController],
  providers: [FileManagerService],
  exports: [FileManagerService],
})
export class FileManagerModule {}
