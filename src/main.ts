import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import type { Request } from 'express';
import { AppModule } from './app.module';

/** Webhook signature schemes hash the bytes as sent, not a re-serialization. */
const captureRawBody = (req: Request, _res: unknown, buffer: Buffer): void => {
  if (buffer?.length) {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(
      new Uint8Array(buffer),
    );
  }
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use(json({ verify: captureRawBody }));
  // Twilio signs flat form params; extended parsing would nest bracketed keys.
  app.use(urlencoded({ extended: false, verify: captureRawBody }));

  app.use(cookieParser());
  app.enableCors({
    origin: [
      'http://localhost:8080',
      'http://localhost:5173',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:5173',
    ],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(3000);
}
bootstrap();
