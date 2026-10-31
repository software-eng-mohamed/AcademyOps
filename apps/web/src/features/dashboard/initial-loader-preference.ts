export const DASHBOARD_INITIAL_LOADER_COOKIE = 'plg_dashboard_loader_seen';

export function markDashboardInitialLoaderSeen() {
  if (typeof document === 'undefined') return;
  // biome-ignore lint/suspicious/noDocumentCookie: the server reads this non-sensitive session UI preference before rendering.
  document.cookie = `${DASHBOARD_INITIAL_LOADER_COOKIE}=1; Path=/; SameSite=Lax`;
}

export function resetDashboardInitialLoader() {
  if (typeof document === 'undefined') return;
  // biome-ignore lint/suspicious/noDocumentCookie: successful login resets the one-time dashboard loader for the new session.
  document.cookie = `${DASHBOARD_INITIAL_LOADER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
