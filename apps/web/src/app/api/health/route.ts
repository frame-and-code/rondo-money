export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok', mode: process.env.NODE_ENV });
}
