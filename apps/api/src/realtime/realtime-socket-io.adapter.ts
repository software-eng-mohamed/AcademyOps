import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { ServerOptions } from 'socket.io';

export class RealtimeSocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly webOrigin: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      path: '/socket.io',
      serveClient: false,
      transports: ['websocket'],
      allowUpgrades: false,
      allowEIO3: false,
      connectTimeout: 10_000,
      pingInterval: 25_000,
      pingTimeout: 20_000,
      maxHttpBufferSize: 4_096,
      perMessageDeflate: false,
      httpCompression: false,
      cors: {
        origin: this.webOrigin,
        credentials: true,
        methods: ['GET', 'POST'],
      },
      allowRequest: (
        request: IncomingMessage,
        callback: (error: string | null | undefined, success: boolean) => void,
      ) => {
        callback(null, request.headers.origin === this.webOrigin);
      },
    });
  }
}
