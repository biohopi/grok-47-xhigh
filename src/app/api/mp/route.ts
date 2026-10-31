import { handleMp } from "@/server/rooms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON", messages: [] }, { status: 400 });
  }
  const result = await handleMp(body);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
