import os from "node:os";

export const dynamic = "force-dynamic";

export function GET() {
  const port = String(process.env.PORT || 3000);
  const addresses: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return Response.json({
    port,
    addresses,
    hints: addresses.map((address) => `http://${address}:${port}`),
  });
}
