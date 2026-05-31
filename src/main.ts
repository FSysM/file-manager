import { NestFactory } from '@nestjs/core';
import { FileManagerModule } from './filemanager.module';

async function bootstrap() {
  const app = await NestFactory.create(FileManagerModule);
  await app.listen(process.env.PORT ?? 3005);
}
bootstrap();
