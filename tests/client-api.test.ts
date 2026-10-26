import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/components/api.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("client api cold starts", () => {
  it("retries a GET once after a transient gateway response", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ready: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = api<{ ready: boolean }>("/api/me");
    await vi.advanceTimersByTimeAsync(3000);

    await expect(pending).resolves.toMatchObject({ ok: true, status: 200, data: { ready: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries auth POSTs after a network failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = api("/api/auth/signup", { method: "POST", body: { username: "shopper" } });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(pending).resolves.toMatchObject({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry other POSTs and uses the waking-server message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/api/shop/checkout", { method: "POST", body: {} })).resolves.toMatchObject({
      ok: false,
      status: 503,
      message: "The server is waking up. Try again in a few seconds.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
