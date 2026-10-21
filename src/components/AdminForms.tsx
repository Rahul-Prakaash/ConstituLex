"use client";

import { useActionState, useState } from "react";
import { changePassword, signIn, type FormState } from "@/app/admin/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, undefined);
  const [show, setShow] = useState(false);
  const [username, setUsername] = useState("");
  return (
    <form action={action} className="gate-form">
      <label>
        <span>Username</span>
        <input name="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required autoFocus />
      </label>
      <label>
        <span>Password</span>
        <div className="pw">
          <input name="password" type={show ? "text" : "password"} autoComplete="current-password" maxLength={256} required />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
            {show ? "hide" : "show"}
          </button>
        </div>
      </label>
      <button className="go wide" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Sign in"} <span aria-hidden>→</span>
      </button>
      {state?.error && <p className="gmsg bad" role="alert">{state.error}</p>}
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, undefined);
  return (
    <form action={action} className="gate-form flat">
      <label>
        <span>Current password</span>
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label>
        <span>New password</span>
        <input name="next" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      <label>
        <span>New password, again</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      <button className="go" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
      {state?.error && <p className="gmsg bad" role="alert">{state.error}</p>}
      {state?.done && <p className="gmsg good" role="status">{state.done}</p>}
    </form>
  );
}
