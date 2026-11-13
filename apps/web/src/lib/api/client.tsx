'use client';

import { useAuth } from '@clerk/nextjs';
import { configureApiClient } from '@rondo/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { API_BASE_URL } from './config';

const DEFAULT_ATTEMPTS = 3;
const UNREPEATABLE = new Set([401, 429]);

function refusedForGood(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    UNREPEATABLE.has(error.statusCode)
  );
}

function shouldRepeat(failures: number, error: unknown): boolean {
  return failures < DEFAULT_ATTEMPTS && !refusedForGood(error);
}

export function ApiProvider({ children }: { children: ReactNode }) {
  const { getToken, userId, isLoaded } = useAuth();

  if (typeof window !== 'undefined') {
    configureApiClient({ baseUrl: API_BASE_URL, getToken });
  }

  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: shouldRepeat } } }),
  );
  const [identity, setIdentity] = useState<string | null | undefined>(undefined);

  if (isLoaded && identity !== userId) {
    setIdentity(userId);
    client.clear();
  }

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
