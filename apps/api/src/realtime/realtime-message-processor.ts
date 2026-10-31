import { parseFanoutMessage, type RealtimeFanoutMessage } from './realtime.contracts';

export class RealtimeMessageProcessor {
  private readonly seen = new Map<string, number>();

  process(raw: string, deliver: (message: RealtimeFanoutMessage) => void): boolean {
    const parsed = this.parse(raw);
    if (!parsed || this.seen.has(parsed.invalidation.eventId)) return false;
    this.seen.set(parsed.invalidation.eventId, Date.now());
    this.prune();
    deliver(parsed);
    return true;
  }

  private parse(raw: string): RealtimeFanoutMessage | null {
    try {
      return parseFanoutMessage(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }

  private prune(): void {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [eventId, seenAt] of this.seen) {
      if (seenAt >= cutoff && this.seen.size <= 10_000) break;
      this.seen.delete(eventId);
    }
  }
}
