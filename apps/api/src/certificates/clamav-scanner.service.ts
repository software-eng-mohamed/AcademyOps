import { createConnection, type Socket } from 'node:net';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MAXIMUM_BYTES = 10 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
const MAXIMUM_RESPONSE_BYTES = 1_024;

@Injectable()
export class ClamavScannerService {
  constructor(private readonly config: ConfigService) {}

  async scan(bytes: Buffer): Promise<void> {
    if (bytes.byteLength > MAXIMUM_BYTES) throw tooLarge();
    const mode = this.config.get<string>('CLAMAV_MODE');
    const production = this.config.get<string>('NODE_ENV') === 'production';
    if (mode === 'disabled' && !production) return;
    if (mode !== 'clamd') throw unavailable();
    const host = this.config.get<string>('CLAMAV_HOST');
    const port = this.config.get<number>('CLAMAV_PORT') ?? 3_310;
    const timeoutMs = this.config.get<number>('CLAMAV_TIMEOUT_MS') ?? 5_000;
    if (!host) throw unavailable();

    let response: string;
    try {
      response = await exchange(host, port, timeoutMs, bytes);
    } catch {
      throw unavailable();
    }
    if (response === 'stream: OK') return;
    if (/^stream: [\x20-\x7e]{1,512} FOUND$/.test(response)) {
      throw new BadRequestException({
        code: 'CERTIFICATE_MALWARE_DETECTED',
        messageKey: 'certificates.malwareDetected',
      });
    }
    throw unavailable();
  }
}

function exchange(host: string, port: number, timeoutMs: number, bytes: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const response: Buffer[] = [];
    let responseBytes = 0;
    let settled = false;
    const timer = setTimeout(() => fail(new Error('clamd timeout')), timeoutMs);
    timer.unref();

    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const succeed = (value: string): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    socket.setNoDelay(true);
    socket.once('error', fail);
    socket.once('close', () => fail(new Error('clamd closed without a response')));
    socket.on('data', (chunk) => {
      const terminator = chunk.indexOf(0);
      const content = terminator < 0 ? chunk : chunk.subarray(0, terminator);
      responseBytes += content.byteLength;
      if (responseBytes > MAXIMUM_RESPONSE_BYTES) return fail(new Error('clamd response too long'));
      response.push(content);
      if (terminator < 0) return;
      if (terminator !== chunk.byteLength - 1) return fail(new Error('clamd response malformed'));
      const value = Buffer.concat(response, responseBytes).toString('utf8');
      if (!/^[\x20-\x7e]+$/.test(value)) return fail(new Error('clamd response malformed'));
      succeed(value);
    });
    socket.once('connect', () => void sendStream(socket, bytes).catch(fail));
  });
}

async function sendStream(socket: Socket, bytes: Buffer): Promise<void> {
  await write(socket, Buffer.from('zINSTREAM\0', 'ascii'));
  for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.byteLength));
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(chunk.byteLength);
    await write(socket, length);
    await write(socket, chunk);
  }
  await write(socket, Buffer.alloc(4));
}

function write(socket: Socket, bytes: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(bytes, (error) => (error ? reject(error) : resolve()));
  });
}

function tooLarge(): BadRequestException {
  return new BadRequestException({
    code: 'CERTIFICATE_FILE_TOO_LARGE',
    messageKey: 'certificates.fileTooLarge',
  });
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'CERTIFICATE_MALWARE_SCAN_UNAVAILABLE',
    messageKey: 'certificates.malwareScanUnavailable',
  });
}
