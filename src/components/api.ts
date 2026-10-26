export type User = { id: string; username: string; paypalEmail: string | null; createdAt: string };

export type Connection = {
  id: string;
  clientId: string;
  clientName: string | null;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
};

export type OrderItem = {
  productId: string;
  title: string;
  quantity: number;
  unitCents: number;
  imageUrl?: string | null;
  merchant?: string | null;
};

export type Order = {
  id: string;
  paypalOrderId?: string | null;
  status: string;
  approveUrl?: string | null;
  totalCents: number;
  currency: string;
  items: OrderItem[];
  shipping?: ShippingAddress | null;
  createdAt?: string;
};

export type ShippingAddress = {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
};

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; message: string; error?: string };

/** Same-origin JSON fetch that never throws. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (response.ok) return { ok: true, status: response.status, data: body as T };
    const record = (body ?? {}) as { message?: string; error?: string };
    return {
      ok: false,
      status: response.status,
      error: record.error,
      message: record.message ?? defaultMessage(response.status),
    };
  } catch {
    return { ok: false, status: 0, message: "Can't reach the server. Check your connection and try again." };
  }
}

function defaultMessage(status: number) {
  if (status === 401) return "Please sign in to continue.";
  if (status === 404) return "Not found.";
  if (status === 429) return "Too many attempts. Wait a few minutes and try again.";
  return "Something went wrong. Please try again.";
}
