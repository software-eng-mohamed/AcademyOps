export function isAllowedCorsOrigin(expectedOrigin: string, requestOrigin?: string): boolean {
  if (requestOrigin === undefined || requestOrigin === expectedOrigin) return true;
  try {
    const expected = new URL(expectedOrigin);
    const request = new URL(requestOrigin);
    return expected.origin === request.origin;
  } catch {
    return false;
  }
}
