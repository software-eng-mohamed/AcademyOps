import { isIP } from 'node:net';

export function trustedProxyAddress(configured: string): (address: string) => boolean {
  if (isIP(configured) !== 4) throw new Error('TRUSTED_PROXY_IP must be an IPv4 address');
  const mapped = `::ffff:${configured}`;
  return (address: string): boolean => address === configured || address === mapped;
}
