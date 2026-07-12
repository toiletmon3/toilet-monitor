import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const logger = new Logger('Bootstrap');

  // Fail-fast / warn on missing configuration so the server never runs silently
  // mis-configured. (JWT_SECRET is additionally hard-enforced in JwtStrategy.)
  if (!process.env.DATABASE_URL) {
    logger.error('FATAL: DATABASE_URL is not set — refusing to start.');
    process.exit(1);
  }
  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'CRON_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) {
    if (!process.env[key]) {
      logger.warn(`Configuration warning: ${key} is not set — related security/features may be weakened or disabled.`);
    }
  }

  app.enableCors({
    origin: [
      process.env.FRONTEND_URL ?? 'http://localhost:5173',
      'https://toiletcleanpro.duckdns.org',
      'https://cleanco.ai',
      'https://www.cleanco.ai',
    ],
    credentials: true,
  });

  // Security response headers on all API responses (dependency-free).
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`Server running on port ${port}`);
}

bootstrap();
