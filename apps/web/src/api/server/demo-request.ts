/** Next may expose an internal URL; browsers send the public Host and Origin. */
export function publicDemoRequest(request: Request): Request {
  const internalUrl = new URL(request.url);
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const scheme =
    protocol === 'https' || protocol === 'http' ? `${protocol}:` : internalUrl.protocol;
  const url = new URL(`${scheme}//${host ?? internalUrl.host}`);
  url.pathname = internalUrl.pathname;
  url.search = internalUrl.search;
  return new Request(url, request);
}
