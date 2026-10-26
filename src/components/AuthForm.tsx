"use client";

import { Link } from "./Link.js";
import { useRouter, useSearchParams } from "next/navigation.js";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "./api.js";
import { Button } from "./Button.js";
import { AlertIcon, EyeIcon, EyeOffIcon, ShieldIcon } from "./Icons.js";
import { useMe } from "./useMe.js";

type Mode = "login" | "signup";

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

function validate(mode: Mode, username: string, password: string) {
  const errors: { username?: string; password?: string } = {};
  const u = username.trim().toLowerCase();
  if (!u) errors.username = "Enter a username.";
  else if (mode === "signup" && !USERNAME_RE.test(u))
    errors.username = "Use 3–32 characters: letters, numbers or underscores.";
  if (!password) errors.password = "Enter a password.";
  else if (mode === "signup" && password.length < 8) errors.password = "Use at least 8 characters.";
  return errors;
}

/** Only pass through same-site relative paths; the server validates again. */
function cleanNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const next = cleanNext(params.get("next"));
  const router = useRouter();
  const me = useMe();
  useEffect(() => {
    if (me.status === "signed-in") router.replace(next ?? "/dashboard");
  }, [me.status, next, router]);
  const fromConsent = next?.startsWith("/connect") ?? false;
  const id = useId();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverErrorCode, setServerErrorCode] = useState<string | null>(null);

  const errors = touched ? validate(mode, username, password) : {};
  const isSignup = mode === "signup";
  const otherHref = `${isSignup ? "/login" : "/signup"}${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const signupHref = `/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  if (me.status !== "signed-out") return <AuthFormFallback />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    setServerError(null);
    setServerErrorCode(null);
    const found = validate(mode, username, password);
    if (found.username || found.password) return;
    setLoading(true);
    const result = await api<{ ok: boolean; next: string }>(`/api/auth/${mode}`, {
      method: "POST",
      body: { username: username.trim().toLowerCase(), password, ...(next ? { next } : {}) },
    });
    if (result.ok) {
      // Full page load: `next` may be a server-rendered page (e.g. /connect consent).
      window.location.assign(result.data?.next || "/dashboard");
      return;
    }
    setLoading(false);
    setServerError(result.message);
    setServerErrorCode(result.error ?? null);
  }

  const inputClass = (invalid: boolean) =>
    [
      "block w-full rounded-xl border bg-paper px-3.5 py-2.5 text-[15px] text-ink shadow-sm outline-none transition",
      "placeholder:text-muted-foreground focus:ring-4",
      invalid
        ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
        : "border-line-strong focus:border-ink focus:ring-ink/10",
    ].join(" ");

  return (
    <div className="w-full max-w-md animate-rise">
      <div className="mb-7 text-center">
        <h1 className="text-[32px] leading-[1.05] font-semibold tracking-[-0.045em] text-ink sm:text-[40px]">
          {isSignup ? "Create your Payout account" : "Welcome back"}
        </h1>
        <p className="mt-3 text-[15px] text-ink-soft">
          {fromConsent
            ? "Sign in to finish connecting Payout to your AI app."
            : isSignup
              ? "Then connect Claude and start shopping from the chat."
              : "Log in to manage your Claude connection and orders."}
        </p>
      </div>

      <div className="rounded-[26px] border border-line bg-paper p-6 shadow-[0_24px_60px_-30px_rgba(45,43,40,0.35)] sm:p-8">
        {serverError ? (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800"
          >
            <AlertIcon className="mt-px h-4 w-4" />
            <span>
              {serverError}
              {serverErrorCode === "unknown_user" ? (
                <>
                  {" "}
                  <Link href={signupHref} className="font-semibold underline underline-offset-2">
                    Create account
                  </Link>
                </>
              ) : null}
            </span>
          </div>
        ) : null}

        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <div>
            <label htmlFor={`${id}-username`} className="mb-1.5 block text-sm font-medium text-ink-soft">
              Username
            </label>
            <input
              id={`${id}-username`}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              maxLength={32}
              placeholder="e.g. alex_shops"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={Boolean(errors.username)}
              aria-describedby={errors.username ? `${id}-username-error` : isSignup ? `${id}-username-hint` : undefined}
              className={inputClass(Boolean(errors.username))}
            />
            {errors.username ? (
              <p id={`${id}-username-error`} className="mt-1.5 text-sm text-red-600">
                {errors.username}
              </p>
            ) : isSignup ? (
              <p id={`${id}-username-hint`} className="mt-1.5 text-xs text-muted-foreground">
                3–32 characters: a–z, 0–9 and _
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={`${id}-password`} className="mb-1.5 block text-sm font-medium text-ink-soft">
              Password
            </label>
            <div className="relative">
              <input
                id={`${id}-password`}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "At least 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? `${id}-password-error` : undefined}
                className={`${inputClass(Boolean(errors.password))} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
              >
                {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
            {errors.password ? (
              <p id={`${id}-password-error`} className="mt-1.5 text-sm text-red-600">
                {errors.password}
              </p>
            ) : null}
          </div>

          <Button type="submit" size="lg" loading={loading} className="w-full">
            {loading ? (isSignup ? "Creating account…" : "Signing in…") : isSignup ? "Create account" : "Log in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          {isSignup ? "Already have an account?" : "New to Payout?"}{" "}
          <Link href={otherHref} className="font-semibold text-ink underline decoration-tan-ink/40 underline-offset-4 hover:decoration-ink">
            {isSignup ? "Log in" : "Create an account"}
          </Link>
        </p>
      </div>

      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldIcon className="h-4 w-4" /> Payments are approved on PayPal. Payout never sees your card.
      </p>
    </div>
  );
}

export function AuthFormFallback() {
  return <div className="h-[460px] w-full max-w-md animate-pulse rounded-[26px] bg-paper" aria-hidden="true" />;
}
