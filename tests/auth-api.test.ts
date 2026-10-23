import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signUp, startServer, type TestServer } from "./helpers/harness.js";

let server: TestServer;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server.close());

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${server.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

describe("username + password auth", () => {
  it("signs up, sets a session cookie and returns the dashboard as next", async () => {
    const response = await post("/api/auth/signup", { username: "Bob_1", password: "password123" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, next: "/dashboard" });
    expect(response.headers.get("set-cookie")).toMatch(/^mcp_session=.+HttpOnly/i);
  });

  it("rejects a taken username and weak credentials", async () => {
    expect((await post("/api/auth/signup", { username: "bob_1", password: "password123" })).status).toBe(409);
    expect((await post("/api/auth/signup", { username: "x", password: "password123" })).status).toBe(400);
    expect((await post("/api/auth/signup", { username: "carol", password: "short" })).status).toBe(400);
  });

  it("logs in with the right password only, and keeps next on this site", async () => {
    expect((await post("/api/auth/login", { username: "bob_1", password: "nope-nope" })).status).toBe(401);
    expect((await post("/api/auth/login", { username: "nobody", password: "password123" })).status).toBe(401);
    const ok = await post("/api/auth/login", { username: "bob_1", password: "password123", next: "/connect?requestId=abc" });
    expect(await ok.json()).toEqual({ ok: true, next: "/connect?requestId=abc" });
    const evil = await post("/api/auth/login", { username: "bob_1", password: "password123", next: "//evil.com" });
    expect((await evil.json()).next).toBe("/");
  });

  it("/api/me needs a session and returns the user without the password hash", async () => {
    expect((await fetch(`${server.baseUrl}/api/me`)).status).toBe(401);
    const { cookie } = await signUp(server.baseUrl, "dana");
    const me = await (await fetch(`${server.baseUrl}/api/me`, { headers: { cookie } })).json();
    expect(me.user.username).toBe("dana");
    expect(me.user).not.toHaveProperty("passwordHash");
  });

  it("links and unlinks a PayPal sandbox email", async () => {
    const { cookie } = await signUp(server.baseUrl, "erin");
    const put = (email: unknown) =>
      fetch(`${server.baseUrl}/api/me/paypal`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ email }),
      });
    expect((await put("not-an-email")).status).toBe(400);
    expect(await (await put("Buyer@Personal.Example.com")).json()).toEqual({ ok: true, paypalEmail: "buyer@personal.example.com" });
    const me = await (await fetch(`${server.baseUrl}/api/me`, { headers: { cookie } })).json();
    expect(me.user.paypalEmail).toBe("buyer@personal.example.com");
    expect((await (await put(null)).json()).paypalEmail).toBeNull();
  });

  it("logout clears the cookie", async () => {
    const response = await post("/api/auth/logout", {});
    expect(response.headers.get("set-cookie")).toMatch(/mcp_session=;/);
  });

  it("kit pages send signed-out users to the Next.js /login with next", async () => {
    const response = await fetch(`${server.baseUrl}/connections`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?next=%2Fconnections");
  });
});

describe("connections API", () => {
  it("returns the MCP URL and the user's connections", async () => {
    const { cookie } = await signUp(server.baseUrl, "frank");
    const body = await (await fetch(`${server.baseUrl}/api/connections`, { headers: { cookie } })).json();
    expect(body).toEqual({ connections: [], mcpUrl: `${server.baseUrl}/mcp` });
  });
});
