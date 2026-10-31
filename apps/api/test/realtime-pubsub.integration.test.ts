import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { describe, expect, it } from 'vitest';
import {
  REALTIME_CHANNEL,
  parseFanoutMessage,
  type RealtimeFanoutMessage,
} from '../src/realtime/realtime.contracts';

const redisUrl = process.env.REDIS_URL;

describe.runIf(Boolean(redisUrl))('realtime multi-instance Redis fanout', () => {
  it('delivers one sanitized invalidation to each API-instance subscriber', async () => {
    const first = redis();
    const second = redis();
    const publisher = redis();
    const message = messageFixture();
    try {
      const firstDelivery = nextMatching(first, message.invalidation.eventId);
      const secondDelivery = nextMatching(second, message.invalidation.eventId);
      await Promise.all([first.subscribe(REALTIME_CHANNEL), second.subscribe(REALTIME_CHANNEL)]);
      await publisher.publish(REALTIME_CHANNEL, JSON.stringify(message));

      const received = await withTimeout(Promise.all([firstDelivery, secondDelivery]));
      expect(received).toEqual([message, message]);
      expect(received[0]?.invalidation).not.toHaveProperty('organizationId');
      expect(received[0]?.invalidation).not.toHaveProperty('payload');
    } finally {
      await Promise.all([first.quit(), second.quit(), publisher.quit()]);
    }
  });
});

function redis(): IORedis {
  return new IORedis(redisUrl!, { maxRetriesPerRequest: 1 });
}

function nextMatching(client: IORedis, eventId: string): Promise<RealtimeFanoutMessage> {
  return new Promise((resolve) => {
    client.on('message', (channel, raw) => {
      if (channel !== REALTIME_CHANNEL) return;
      const parsed = parseFanoutMessage(JSON.parse(raw) as unknown);
      if (parsed?.invalidation.eventId === eventId) resolve(parsed);
    });
  });
}

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Redis pub/sub delivery timed out')), 3_000);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function messageFixture(): RealtimeFanoutMessage {
  return {
    v: 1,
    organizationId: randomUUID(),
    staff: true,
    studentPersonIds: [randomUUID()],
    invalidation: {
      v: 1,
      eventId: randomUUID(),
      topics: ['student', 'notifications'],
      occurredAt: new Date().toISOString(),
    },
  };
}
