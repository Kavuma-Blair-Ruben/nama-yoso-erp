"use client";

import { useActionState } from "react";
import { setInitialPassword } from "@/server/actions/auth";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setInitialPassword, undefined);

  return (
    <form action={action} className="login-form">
      <div className="form-row">
        <label htmlFor="password">New Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="form-row">
        <label htmlFor="confirm">Confirm Password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state?.error && <div className="login-error">{state.error}</div>}
      <button className="btn accent" type="submit" disabled={pending}>
        {pending ? "Setting password…" : "Set Password & Continue"}
      </button>
    </form>
  );
}
