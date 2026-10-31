import type { PlgRequestInit } from '@academyops/api-client/http';
import { browserTransport } from './transport';

export async function plgGeneratedFetch<T>(url: string, options: PlgRequestInit): Promise<T> {
  const response = await browserTransport.fetch(url, options);
  const data = await browserTransport.read<unknown>(response);
  return { data, status: response.status, headers: response.headers } as T;
}
