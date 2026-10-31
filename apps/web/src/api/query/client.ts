import { QueryClient } from '@tanstack/react-query';
import { mutationRetry, queryRetry, queryRetryDelay } from './retry-policy';

export function createApiQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: mutationRetry,
        retryDelay: queryRetryDelay,
      },
      queries: {
        gcTime: 10 * 60_000,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
        retry: queryRetry,
        retryDelay: queryRetryDelay,
        staleTime: 30_000,
      },
    },
  });
}
