"use client";

import { useId, useState, type FormEvent } from "react";
import { api, type User } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { Card, CardBody, CardHeader } from "@/components/Card.js";
import { CheckIcon, PayPalMark } from "@/components/Icons.js";
import { Pill } from "@/components/StatusPill.js";

export function PayPalCard({ user, onChange }: { user: User; onChange: (email: string | null) => void }) {
  const id = useId();
  const [editing, setEditing] = useState(!user.paypalEmail);
  const [email, setEmail] = useState(user.paypalEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(value: string | null) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await api<{ ok: boolean; paypalEmail: string | null }>("/api/me/paypal", { method: "PUT", body: { email: value } });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onChange(result.data.paypalEmail);
    setEmail(result.data.paypalEmail ?? "");
    setEditing(!result.data.paypalEmail);
    setSaved(true);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter the email of your PayPal sandbox account.");
      return;
    }
    void save(value);
  }

  return (
    <Card>
      <CardHeader
        icon={<PayPalMark className="h-5 w-5" />}
        title="PayPal"
        description="Checkout runs on PayPal Sandbox."
        action={user.paypalEmail ? <Pill tone="green">Linked</Pill> : <Pill tone="slate">Optional</Pill>}
      />
      <CardBody className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-soft">
          When you check out, you approve the payment on PayPal itself. This email pre-fills the PayPal login.
        </p>

        {!editing && user.paypalEmail ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-cream px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">PayPal email (test mode)</p>
              <p className="truncate text-sm font-semibold text-ink">{user.paypalEmail}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Change
              </Button>
              <Button variant="danger" size="sm" loading={busy} onClick={() => void save(null)}>
                Unlink
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-2">
            <label htmlFor={`${id}-email`} className="block text-sm font-medium text-ink-soft">
              PayPal email (test mode)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={`${id}-email`}
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(error)}
                className="min-w-0 flex-1 rounded-xl border border-line-strong bg-paper px-3.5 py-2 text-sm text-ink shadow-sm outline-none focus:border-ink focus:ring-4 focus:ring-ink/10"
              />
              <Button type="submit" variant="paypal" loading={busy}>
                Link PayPal
              </Button>
              {user.paypalEmail ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setEmail(user.paypalEmail ?? "");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">Only prefills the PayPal login at checkout.</p>
          </form>
        )}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {saved && !error ? (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckIcon className="h-4 w-4" /> Saved
          </p>
        ) : null}

      </CardBody>
    </Card>
  );
}
