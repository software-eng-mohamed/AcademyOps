import { describe, expect, it } from 'vitest';
import { isLegacyImportReviewV3 } from '../src/imports/import-review-schema';

describe('real academy review schema compatibility', () => {
  it('recognizes the exact schemaVersion field used by the supplied review JSON', () => {
    expect(isLegacyImportReviewV3({ schemaVersion: 'academy-data-steward-response/v3' })).toBe(
      true,
    );
  });

  it('does not derive row bindings for an unknown unversioned review', () => {
    expect(isLegacyImportReviewV3({})).toBe(false);
  });
});
