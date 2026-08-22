import { type ConfigService } from '@nestjs/config';

export const APP_ENVIRONMENTS = ['development', 'test', 'production'] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export const DEFAULT_ENVIRONMENT: AppEnvironment = 'development';

export function resolveEnvironment(config: ConfigService): AppEnvironment {
  const configured = config.get<string>('NODE_ENV')?.trim();

  if (!configured) {
    return DEFAULT_ENVIRONMENT;
  }

  const known = APP_ENVIRONMENTS.find((environment) => environment === configured);

  if (!known) {
    throw new Error(
      `NODE_ENV is "${configured}", which this app does not recognise. Expected one of ` +
        `${APP_ENVIRONMENTS.join(', ')}. It decides whether the API documentation is served, ` +
        'so an unrecognised value is refused rather than guessed at.',
    );
  }

  return known;
}
