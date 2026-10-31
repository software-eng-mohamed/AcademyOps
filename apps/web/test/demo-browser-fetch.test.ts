import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoAwareFetch } from '@/api/browser/demo-fetch';

afterEach(() => {
  delete document.documentElement.dataset.academyopsDemo;
  vi.unstubAllGlobals();
});

describe('cookie-backed demo request ordering', () => {
  it('waits for a mutation response before sending the next mutation, while allowing reads', async () => {
    document.documentElement.dataset.academyopsDemo = 'true';
    let release!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const network = vi.fn().mockReturnValueOnce(firstResponse).mockResolvedValue(Response.json({}));
    vi.stubGlobal('fetch', network);
    const first = demoAwareFetch('/api/v1/students', { method: 'POST' });
    const second = demoAwareFetch('/api/v1/payments', { method: 'POST' });
    await Promise.resolve();
    expect(network).toHaveBeenCalledTimes(1);
    await demoAwareFetch('/api/v1/students');
    expect(network).toHaveBeenCalledTimes(2);
    release(Response.json({}));
    await Promise.all([first, second]);
    expect(network.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/students',
      '/api/v1/students',
      '/api/v1/payments',
    ]);
  });

  it('does not serialize ordinary application mutations', async () => {
    const network = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal('fetch', network);
    const requests = [
      demoAwareFetch('/api/v1/students', { method: 'POST' }),
      demoAwareFetch('/api/v1/payments', { method: 'POST' }),
    ];
    expect(network).toHaveBeenCalledTimes(2);
    await Promise.all(requests);
  });

  it('recovers the queue after a failure without sending an aborted request', async () => {
    document.documentElement.dataset.academyopsDemo = 'true';
    const network = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(Response.json({}));
    vi.stubGlobal('fetch', network);
    await expect(demoAwareFetch('/api/v1/students', { method: 'POST' })).rejects.toThrow('offline');
    const controller = new AbortController();
    controller.abort();
    await expect(
      demoAwareFetch('/api/v1/payments', { method: 'POST', signal: controller.signal }),
    ).rejects.toThrow();
    await demoAwareFetch('/api/v1/students', { method: 'POST' });
    expect(network).toHaveBeenCalledTimes(2);
  });
});
