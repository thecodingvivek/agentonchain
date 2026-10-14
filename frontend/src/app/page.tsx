"use client";

import { useRef, useState, type FormEvent } from "react";
import { Workspace } from "@/components/workspace";
import { authenticateDemo, DEMO_CREDENTIALS } from "@/lib/mock-auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const usernameInput = useRef<HTMLInputElement>(null);

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authenticateDemo(username, password)) {
      setError("That username or password isn’t right. Try the demo credentials below.");
      return;
    }
    setError("");
    setPassword("");
    setSignedIn(true);
  }

  function signOut() {
    setSignedIn(false);
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setError("");
    requestAnimationFrame(() => usernameInput.current?.focus());
  }

  if (signedIn) return <Workspace onSignOut={signOut} />;

  return (
    <main className="login-page">
      <header className="brand">agentonchain.</header>
      <section className="login-card" aria-labelledby="login-heading">
        <span className="prototype-badge">Local prototype</span>
        <h1 id="login-heading">Welcome back</h1>
        <p className="intro">Sign in to your agent workspace.</p>
        <form onSubmit={signIn} className="login-form">
          <div className="field-group">
            <label htmlFor="username">Username</label>
            <input ref={usernameInput} id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Enter your username" required value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
          </div>
          <div className="field-group">
            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
              <button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button>
            </div>
          </div>
          {error && <p id="login-error" className="form-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button">Sign in</button>
        </form>
        <section className="demo-note" aria-labelledby="demo-heading">
          <h2 id="demo-heading">Demo credentials</h2>
          <p>Use these credentials to try the prototype.</p>
          <dl className="demo-credentials">
            <div><dt>Username</dt><dd><code>{DEMO_CREDENTIALS.username}</code></dd></div>
            <div><dt>Password</dt><dd><code>{DEMO_CREDENTIALS.password}</code></dd></div>
          </dl>
        </section>
        <p className="form-footnote">Mock login. No account needed.</p>
      </section>
      <footer className="page-footer">A little more intelligence. A lot more possibility.</footer>
    </main>
  );
}
