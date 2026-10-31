import { browserTransport } from './transport';

export function resetDemoData() {
  return browserTransport.request('/api/v1/demo/reset', { method: 'POST' });
}
