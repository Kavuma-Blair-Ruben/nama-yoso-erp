import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";

// Streams an uploaded document back same-origin for inline viewing.
// Embedding the raw cross-origin Supabase Storage URL directly in an
// <iframe>/<object> renders a blank/black frame in some browsers — proxying
// it through our own origin (with Content-Disposition: inline) avoids
// whatever cross-origin framing quirk causes that.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  const allowedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/`;
  if (!url || !url.startsWith(allowedPrefix)) {
    return new NextResponse("Invalid url", { status: 400 });
  }

  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Failed to fetch file", { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=60",
    },
  });
}
