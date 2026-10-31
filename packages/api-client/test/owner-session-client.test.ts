import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlgApiClient } from '../src/client.js';

afterEach(() => vi.unstubAllGlobals());
const client = new PlgApiClient({
  baseUrl: 'http://localhost:3001/api/v1',
  getCsrfToken: () => 'csrf-owner',
});
const mutation = { id: 'session-1', status: 'SCHEDULED', version: 4 };
const session = {
  id: 'session-1',
  cohortModuleId: 'cm-1',
  cohortId: 'cohort-1',
  roomId: 'room-1',
  ordinal: 2,
  startsAt: '2026-08-12T08:00:00.000Z',
  endsAt: '2026-08-12T10:00:00.000Z',
  deliveryMode: 'IN_PERSON',
  status: 'SCHEDULED',
  attendanceWindowState: 'SCHEDULED',
  coordinatorName: null,
  module: null,
  version: 3,
  cohort: {
    id: 'cohort-1',
    programVersionId: 'pv-1',
    owningBranchId: 'branch-1',
    code: 'C-1',
    name: null,
    status: 'ACTIVE',
    startsOn: null,
    endsOn: null,
    capacity: 20,
    version: 2,
  },
  room: {
    id: 'room-1',
    branchId: 'branch-1',
    code: 'R-1',
    name: 'Room',
    capacity: 30,
    isActive: true,
    version: 1,
  },
  trainers: [
    {
      id: 'assignment-1',
      sessionId: 'session-1',
      trainerId: 'trainer-1',
      role: 'PRIMARY',
      bookingStatus: 'CONFIRMED',
      trainer: {
        id: 'trainer-1',
        personId: 'person-1',
        status: 'ACTIVE',
        biographyAr: null,
        biographyEn: null,
        version: 1,
        person: {
          id: 'person-1',
          publicId: 'TRN-001',
          name: 'Trainer One',
        },
      },
    },
  ],
};
describe('owner session and approval client', () => {
  it('strictly validates and filters the session calendar', async () => {
    const page = { items: [session], nextCursor: 'session-1' };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      client.listOwnerSessions({ branchId: 'branch-1', from: '2026-08-12', limit: 50 }),
    ).resolves.toEqual(page);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      '/sessions?branchId=branch-1&from=2026-08-12&limit=50',
    );
  });
  it('rejects an invalid nested session response', async () => {
    const invalid = { items: [{ ...session, room: { id: 'room-1' } }], nextCursor: null };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(invalid), { status: 200 })),
    );
    await expect(client.listOwnerSessions()).rejects.toMatchObject({
      payload: { code: 'RESPONSE_INVALID' },
    });
  });
  it('sends stable mutation headers for create and reschedule', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(mutation), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    await client.createOwnerSession(
      {
        cohortModuleId: 'cm-1',
        cohortId: 'cohort-1',
        ordinal: 2,
        deliveryMode: 'ONLINE',
      },
      'create-key',
    );
    await client.rescheduleOwnerSession(
      'session-1',
      {
        startsAt: '2026-08-13T08:00:00.000Z',
        endsAt: '2026-08-13T10:00:00.000Z',
        reason: 'Trainer availability',
      },
      3,
      'reschedule-key',
    );
    const [, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, rescheduleInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(createInit.headers).toMatchObject({ 'idempotency-key': 'create-key' });
    expect(rescheduleInit.headers).toMatchObject({
      'If-Match': '3',
      'idempotency-key': 'reschedule-key',
    });
  });
  it('posts and rejects pending payments with optimistic versions', async () => {
    const result = { id: 'payment-1', status: 'POSTED', version: 5, receiptSerial: null };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(result), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    await client.postPendingPayment('payment-1', 4, 'post-key');
    await client.rejectPendingPayment('payment-1', 'Duplicate payment', 4, 'reject-key');
    const [, postInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, rejectInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(postInit.headers).toMatchObject({ 'If-Match': '4', 'idempotency-key': 'post-key' });
    expect(rejectInit.headers).toMatchObject({ 'If-Match': '4', 'idempotency-key': 'reject-key' });
    expect(JSON.parse(String(rejectInit.body))).toEqual({ reason: 'Duplicate payment' });
  });
  it('uses the pricing lock version and idempotency key for a decision', async () => {
    const pricing = {
      id: 'pricing-1',
      status: 'PROPOSED',
      version: 2,
      lockVersion: 7,
      subtotal: '1000.00',
      discountAmount: '100.00',
      totalAmount: '900.00',
      requiredApprovalTier: 1,
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(pricing), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.getPricingApproval('pricing-1')).resolves.toEqual(pricing);
    await client.decidePricingApproval('pricing-1', 'approve', 'Within policy', 7, 'pricing-key');
    const [, decisionInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(decisionInit.headers).toMatchObject({
      'If-Match': '7',
      'idempotency-key': 'pricing-key',
    });
  });
});
