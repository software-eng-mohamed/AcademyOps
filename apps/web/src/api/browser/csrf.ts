export function readCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const secure = window.location.protocol === 'https:';
  const names = secure ? ['__Host-plg_csrf=', 'plg_csrf='] : ['plg_csrf=', '__Host-plg_csrf='];
  for (const name of names) {
    const cookie = document.cookie.split('; ').find((value) => value.startsWith(name));
    if (cookie) return decodeURIComponent(cookie.slice(name.length));
  }
  return undefined;
}
