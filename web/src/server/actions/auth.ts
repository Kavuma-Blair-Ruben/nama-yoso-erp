"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { withTimeout } from "@/lib/withTimeout";

export type LoginState = { error?: string } | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createSupabaseServerClient();
  let result: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
  try {
    result = await withTimeout(supabase.auth.signInWithPassword({ email, password }), 15000, "TIMEOUT");
  } catch {
    return { error: "The sign-in service is taking too long to respond right now — please try again in a moment." };
  }
  if (result.error) return { error: "Invalid email or password." };

  redirect("/apps");
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  try {
    await withTimeout(supabase.auth.signOut(), 8000, "TIMEOUT");
  } catch {
    // Best-effort — the user is leaving regardless; don't let a slow
    // upstream trap them on a "Signing out..." screen that never resolves.
  }
  redirect("/login");
}

export type SetPasswordState = { error?: string } | undefined;

// Relies on the session /auth/confirm already established via cookies (from
// verifyOtp on the invite token) — this action never receives or generates a
// password itself, it only forwards what the invitee typed into their own form.
export async function setInitialPassword(_prevState: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };

  const supabase = await createSupabaseServerClient();
  let userResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  let updateResult: Awaited<ReturnType<typeof supabase.auth.updateUser>>;
  try {
    userResult = await withTimeout(supabase.auth.getUser(), 10000, "TIMEOUT");
    if (!userResult.data.user) return { error: "This invite link has expired — ask your admin to resend it." };
    updateResult = await withTimeout(supabase.auth.updateUser({ password }), 10000, "TIMEOUT");
  } catch {
    return { error: "The sign-in service is taking too long to respond right now — please try again in a moment." };
  }
  if (updateResult.error) return { error: updateResult.error.message };

  redirect("/apps");
}
