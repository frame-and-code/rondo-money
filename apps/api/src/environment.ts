import { type ConfigService } from '@nestjs/config';

/**
 * The environments this app distinguishes, and the only accepted values of `NODE_ENV`.
 *
 * `test` is here because Jest sets `NODE_ENV=test` in its own process — leaving it out
 * would make every spec that resolves the environment throw.
 */
export const APP_ENVIRONMENTS = ['development', 'test', 'production'] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/**
 * What an unset `NODE_ENV` means. A developer's shell has no reason to carry the variable,
 * so the local default has to be the harmless one — and `development` is also the value
 * that turns the API documentation on (see `areApiDocsEnabled`).
 */
export const DEFAULT_ENVIRONMENT: AppEnvironment = 'development';

/**
 * The environment this instance runs in, from `NODE_ENV`.
 *
 * Unrecognised values throw rather than falling back: the variable now decides whether the
 * Swagger UI is served, so reading `NODE_ENV=prod` as "not production" would quietly publish
 * the documentation on the one deployment that is supposed to hide it. Failing at boot is
 * loud, immediate and impossible to miss; a silent guess is none of those.
 *
 * ⚠️ The api image sets `NODE_ENV=production` itself (apps/api/Dockerfile), so *every*
 * deployment reports production unless the platform overrides the variable. That is the safe
 * default — a new environment hides its docs until someone says otherwise — but it means the
 * Railway dev environment has to set `NODE_ENV=development` explicitly to get them back
 * (docs/deploy-railway.md).
 */
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
