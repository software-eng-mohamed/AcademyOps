# Paymob Installment Checkout

## Approved behavior

`POST /api/v1/installments/{installmentId}/paymob-checkout` creates a hosted Paymob Unified Checkout for the exact outstanding amount of one activated installment. It requires `Idempotency-Key` and the `payments.checkout` permission:

- Owner: organization scope.
- Accounts: assigned-branch scope.
- Student: self scope.

The client receives a hosted checkout URL. Returning from Paymob is a user-experience event only. The installment is settled only after `POST /api/v1/webhooks/paymob/transaction?hmac=...` passes the official 20-field SHA-512 HMAC check, integration-ID allowlist, amount/currency match, and database idempotency checks.

Successful webhooks create, in one serializable PostgreSQL transaction:

1. A posted `Payment` using the seeded `PAYMOB` method.
2. An append-only credit ledger entry allocated to the selected installment first.
3. An internal receipt.
4. The gateway event, audit event, and outbox events.

Repeated callbacks cannot create a second payment. A timeout while creating an intention becomes `UNKNOWN` and requires reconciliation; the system does not automatically retry an external request whose outcome is unknown.

Paymob refund/void callbacks are recorded as reversal observations and create an outbox review event. They do not silently rewrite the AR subledger or bypass the existing maker-checker reversal/refund commands.

## Configuration

All values are required before the checkout or webhook routes can operate:

```text
PAYMOB_BASE_URL=https://accept.paymob.com
PAYMOB_SECRET_KEY=<server-side secret key>
PAYMOB_PUBLIC_KEY=<public key>
PAYMOB_HMAC_SECRET=<webhook HMAC secret>
PAYMOB_PAYMENT_METHOD_IDS=<comma-separated enabled integration IDs>
PAYMOB_NOTIFICATION_URL=https://<same-origin-host>/api/v1/webhooks/paymob/transaction
PAYMOB_REDIRECTION_URL=https://<same-origin-host>/ar/payments/paymob/return
PAYMOB_CHECKOUT_ENCRYPTION_KEY=<exactly 32 random bytes encoded as base64>
```

The secret key, HMAC secret, and encryption key are server-only. The checkout client secret is encrypted at rest. The webhook stores only a SHA-256 payload digest, not a second raw copy of Paymob/customer data.

Start with Paymob test credentials. Enable only the Integration IDs actually approved in the merchant dashboard. Bank installment and BNPL options appear only when Paymob enables/configures those methods for the merchant; the application does not infer availability.

## Production gate

Before enabling Paymob in production:

- provision test credentials and enabled Integration IDs;
- configure the public HTTPS notification and redirection URLs;
- run successful, declined, pending, duplicate, delayed, wrong-HMAC, wrong-amount, and timeout reconciliation tests;
- confirm finance reconciliation from Paymob transactions to payments, ledger allocations, and receipts;
- document the operational response to `UNKNOWN` and reversal-observed attempts.

Primary references: [Paymob API integration path](https://developers.paymob.com/paymob-docs/integration-paths/apis), [Unified Checkout](https://developers.paymob.com/paymob-docs/developers/checkout-experiences), and [webhook/HMAC overview](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac).
