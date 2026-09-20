import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

/**
 * Owns the single Mongoose connection for the whole app.
 *
 * @Global per CLAUDE.md: infrastructure modules are the deliberate,
 * narrow exception to "don't use @Global() as a shortcut" — feature
 * modules must still import each other explicitly.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        // Fail fast rather than buffering commands against a dead
        // connection and surfacing the problem as a request timeout.
        serverSelectionTimeoutMS: 5000,
        bufferCommands: false,
      }),
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
