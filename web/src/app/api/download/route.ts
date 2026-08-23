import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";

// Forces a real file download for uploaded documents (recipe photos, GRN
// invoice scans). Browsers silently ignore the <a download> attribute on
// cross-origin URLs (our Supabase Storage domain differs from the app's own
// origin) unless the response itself sends Content-Disposition: attachment —
// this route fetches the file server-side and adds that header so "Download"
// always saves the file instead of just re-opening it like "View" does.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") || "download";
  const allowedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/`;
  if (!url || !url.startsWith(allowedPrefix)) {
    return new NextResponse("Invalid url", { status: 400 });
  }

  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Failed to fetch file", { status: 502 });
  }

  const safeFilename = filename.replace(/[^\w.\- ]/g, "_");
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
    },
  });
}
