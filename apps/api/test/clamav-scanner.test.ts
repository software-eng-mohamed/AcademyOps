import { createServer, type Server, type Socket } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';
import { ClamavScannerService } from '../src/certificates/clamav-scanner.service';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => close(server)));
});

describe('ClamAV INSTREAM scanner', () => {
  it('streams bounded chunks and accepts only an OK response', async () => {
    const bytes = Buffer.alloc(70 * 1024, 0x41);
    const mock = await clamd(Buffer.from('stream: OK\0'));
    await scanner(mock.port).scan(bytes);
    expect(await mock.received).toEqual(bytes);
  });

  it('maps an EICAR FOUND response to a sanitized bad request', async () => {
    const eicar = Buffer.from(
      ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''),
    );
    const mock = await clamd(Buffer.from('stream: Win.Test.EICAR_HDB-1 FOUND\0'));
    await expect(scanner(mock.port).scan(eicar)).rejects.toMatchObject({
      status: 400,
      response: { code: 'CERTIFICATE_MALWARE_DETECTED' },
    });
    expect(await mock.received).toEqual(eicar);
  });

  it('fails closed on timeout and unavailable clamd', async () => {
    const hanging = await clamd(undefined);
    await expect(scanner(hanging.port, 30).scan(Buffer.from('pdf'))).rejects.toMatchObject({
      status: 503,
      response: { code: 'CERTIFICATE_MALWARE_SCAN_UNAVAILABLE' },
    });
    const port = await unusedPort();
    await expect(scanner(port, 30).scan(Buffer.from('pdf'))).rejects.toMatchObject({ status: 503 });
  });

  it.each([
    Buffer.from('unexpected response\0'),
    Buffer.from('stream: OK\0trailing'),
    Buffer.from('x'.repeat(1_025)),
  ])('fails closed on a malformed or oversized response', async (response) => {
    const mock = await clamd(response);
    await expect(scanner(mock.port).scan(Buffer.from('pdf'))).rejects.toMatchObject({
      status: 503,
    });
  });

  it('rejects oversized input before opening a connection', async () => {
    await expect(scanner(1).scan(Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toMatchObject({
      status: 400,
      response: { code: 'CERTIFICATE_FILE_TOO_LARGE' },
    });
  });

  it('permits only explicit nonproduction disabled mode', async () => {
    await expect(
      new ClamavScannerService(new ConfigService({ NODE_ENV: 'test', CLAMAV_MODE: '' })).scan(
        Buffer.from('pdf'),
      ),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      new ClamavScannerService(
        new ConfigService({ NODE_ENV: 'production', CLAMAV_MODE: 'disabled' }),
      ).scan(Buffer.from('pdf')),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      new ClamavScannerService(
        new ConfigService({ NODE_ENV: 'test', CLAMAV_MODE: 'disabled' }),
      ).scan(Buffer.from('pdf')),
    ).resolves.toBeUndefined();
  });
});

function scanner(port: number, timeoutMs = 250): ClamavScannerService {
  return new ClamavScannerService(
    new ConfigService({
      NODE_ENV: 'production',
      CLAMAV_MODE: 'clamd',
      CLAMAV_HOST: '127.0.0.1',
      CLAMAV_PORT: port,
      CLAMAV_TIMEOUT_MS: timeoutMs,
    }),
  );
}

async function clamd(
  response: Buffer | undefined,
): Promise<{ port: number; received: Promise<Buffer> }> {
  let receive: (bytes: Buffer) => void = () => undefined;
  const received = new Promise<Buffer>((resolve) => (receive = resolve));
  const server = createServer((socket) => parseStream(socket, response, receive));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock clamd port unavailable');
  return { port: address.port, received };
}

function parseStream(
  socket: Socket,
  response: Buffer | undefined,
  receive: (bytes: Buffer) => void,
): void {
  let pending = Buffer.alloc(0);
  let commandRead = false;
  const chunks: Buffer[] = [];
  socket.on('data', (data) => {
    pending = Buffer.concat([pending, data]);
    if (!commandRead) {
      const terminator = pending.indexOf(0);
      if (terminator < 0) return;
      if (pending.subarray(0, terminator).toString('ascii') !== 'zINSTREAM')
        return socket.destroy();
      pending = pending.subarray(terminator + 1);
      commandRead = true;
    }
    while (pending.byteLength >= 4) {
      const length = pending.readUInt32BE(0);
      if (length > 64 * 1024) return socket.destroy();
      if (pending.byteLength < length + 4) return;
      pending = pending.subarray(4);
      if (length === 0) {
        receive(Buffer.concat(chunks));
        if (response) socket.end(response);
        return;
      }
      chunks.push(pending.subarray(0, length));
      pending = pending.subarray(length);
    }
  });
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unused port unavailable');
  await close(server);
  return address.port;
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
