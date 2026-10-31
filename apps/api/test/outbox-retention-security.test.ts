import { describe, expect, it } from 'vitest';
import { outboxJobRetention } from '../src/worker/outbox-dispatcher.service';

describe('outbox queue retention', () => {
  it.each(['security.password_reset_requested', 'security.phone_otp_requested'])(
    'deletes transient security payloads after terminal delivery',
    (type) => {
      expect(outboxJobRetention(type)).toEqual({ removeOnComplete: true, removeOnFail: true });
    },
  );

  it('retains bounded operational history for non-secret events', () => {
    expect(outboxJobRetention('attendance.recorded')).toEqual({
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  });
});
