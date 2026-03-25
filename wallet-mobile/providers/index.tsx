import React, { useEffect } from 'react';
import { configureApiClient } from '@flowindex/wallet-core';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://flowindex.io/api';

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    configureApiClient({ baseUrl: API_BASE_URL });
  }, []);

  return <>{children}</>;
}
