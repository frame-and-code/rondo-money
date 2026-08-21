'use client';

import { useAuth } from '@clerk/nextjs';
import { configureApiClient } from '@rondo/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { API_BASE_URL } from './config';

export function ApiProvider({ children }: { children: ReactNode }) {
  const { getToken, userId, isLoaded } = useAuth();

  if (typeof window !== 'undefined') {
    configureApiClient({ baseUrl: API_BASE_URL, getToken });
  }

  const [client] = useState(() => new QueryClient());
  const [identity, setIdentity] = useState<string | null | undefined>(undefined);

  if (isLoaded && identity !== userId) {
    setIdentity(userId);
    client.clear();
  }

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
