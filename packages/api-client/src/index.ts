import { client } from './generated/client.gen';

export * from './generated';

export * as schemas from './generated/zod.gen';

export type SessionTokenReader = () => Promise<string | null>;

export interface ApiClientOptions {
  baseUrl: string;
  getToken: SessionTokenReader;
}

export function configureApiClient({ baseUrl, getToken }: ApiClientOptions): void {
  client.setConfig({
    baseUrl,
    auth: async () => (await getToken()) ?? undefined,
  });
}
