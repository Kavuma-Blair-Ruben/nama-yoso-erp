import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

// Deliberately does NOT rely on Supabase's own hosted /auth/v1/verify
// redirect (the "action_link" it would otherwise generate) — the invite
// email links here directly with the raw token_hash so this app controls
// the whole flow server-side, with no client-side URL-fragment parsing and
// no dependency on which auth flow type (implicit/PKCE) the project is
// configured for.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/set-password";

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=invite-link-invalid", request.url));
}
