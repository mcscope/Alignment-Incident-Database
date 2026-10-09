import { incidents } from "../../lib/data";

// Full machine-readable export, CVE-feed style. Static: generated at build time.
export function GET() {
  return new Response(
    JSON.stringify({ generated: new Date().toISOString(), count: incidents.length, incidents }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
}
