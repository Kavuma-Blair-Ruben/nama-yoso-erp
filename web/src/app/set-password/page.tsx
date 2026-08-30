import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { Logo } from "@/components/ui/Logo";
import { SetPasswordForm } from "./set-password-form";
import { withTimeout } from "@/lib/withTimeout";

export default async function SetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await withTimeout(supabase.auth.getUser(), 20000, "This is taking longer than expected — please try again in a moment.");

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-text">
            <Logo height={58} />
            <span>Inventory Management</span>
          </div>
        </div>
        {user ? (
          <>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16, textAlign: "center" }}>
              Signed in as {user.email}. Set a new password below.
            </p>
            <SetPasswordForm />
          </>
        ) : (
          <div className="login-error">This invite link is invalid or has expired — ask your admin to resend the invite.</div>
        )}
      </div>
    </div>
  );
}
