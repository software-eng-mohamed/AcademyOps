import { handleDemoRequest } from '@/api/demo/router';
import { publicDemoRequest } from '@/api/server/demo-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  if (process.env.ACADEMYOPS_DEMO_ONLY !== 'true') {
    return Response.json({ code: 'NOT_FOUND', messageKey: 'errors.notFound' }, { status: 404 });
  }
  return handleDemoRequest(publicDemoRequest(request));
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
