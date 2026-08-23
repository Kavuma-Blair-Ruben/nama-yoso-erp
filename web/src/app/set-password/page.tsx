import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { Logo } from "@/components/ui/Logo";
import { SetPasswordForm } from "./set-password-form";

export default async function SetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-text">
            <Logo height={58} />
            <span>Cost Control ERP</span>
          </div>
        </div>
        {user ? (
          <>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16, textAlign: "center" }}>
              Welcome, {user.email}. Set a password to finish setting up your account.
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
