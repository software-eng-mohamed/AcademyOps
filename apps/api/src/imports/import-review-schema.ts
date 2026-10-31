export type ImportReviewSchemaHeader = {
  $schema?: string;
  schemaVersion?: string;
};

export function isLegacyImportReviewV3(review: ImportReviewSchemaHeader): boolean {
  return (
    review.schemaVersion === 'academy-data-steward-response/v3' ||
    review.$schema?.endsWith('/academy-data-steward-response/v3') === true ||
    review.$schema?.endsWith('/v3') === true
  );
}
