export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { service: 'web', status: 'healthy', timestamp: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
