"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <main className="login-page">
      <section className="login-intro">
        <span className="wordmark">Titan</span>
        <div className="login-copy">
          <p className="eyebrow">YOUR BANKING AGENT</p>
          <h1>One conversation for your financial life.</h1>
          <p>
            Start with everyday banking. Titan only brings in insurance or investing when you decide they are
            relevant.
          </p>
        </div>
        <div className="trust-line">
          <ShieldCheck size={17} />
          <span>Every meaningful action requires your approval.</span>
        </div>
      </section>
      <section className="login-form-panel">
        <form action={formAction} className="login-form">
          <h2>Welcome back</h2>
          <p>Sign in to continue with Titan.</p>
          <label className="field">
            <span>Email address</span>
            <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Your password"
            />
          </label>
          {state.error && (
            <p className="form-error" role="alert">
              {state.error}
            </p>
          )}
          <button type="submit" disabled={pending} className="login-submit">
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
