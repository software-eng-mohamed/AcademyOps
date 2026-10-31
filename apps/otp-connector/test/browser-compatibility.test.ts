import { describe, expect, it, vi } from 'vitest';
import { Client } from 'whatsapp-web.js';

function clientWithBrowser() {
  const client = new Client({});
  const browser = {
    connected: true,
    close: vi.fn(() => {
      browser.connected = false;
      return Promise.resolve();
    }),
  };
  const authentication = {
    destroy: vi.fn(() => Promise.resolve()),
    logout: vi.fn(() => Promise.resolve()),
  };
  const page = { evaluate: vi.fn(() => Promise.resolve()) };
  Object.assign(client, { pupBrowser: browser, pupPage: page, authStrategy: authentication });
  return { client, browser, authentication, page };
}

describe('WhatsApp client with the supported Puppeteer browser interface', () => {
  it('closes its connected browser and authentication resources on shutdown', async () => {
    const { client, browser, authentication } = clientWithBrowser();

    await client.destroy();

    expect(browser.close).toHaveBeenCalledOnce();
    expect(browser.connected).toBe(false);
    expect(authentication.destroy).toHaveBeenCalledOnce();
  });

  it('logs out after browser shutdown without calling the removed isConnected method', async () => {
    const { client, browser, authentication, page } = clientWithBrowser();

    await client.logout();

    expect(page.evaluate).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
    expect(authentication.logout).toHaveBeenCalledOnce();
  });
});
