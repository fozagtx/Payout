import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usernameKey } from "../src/lib/password.js";
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
  it("normalizes confusable usernames and rejects reserved names", async () => {
    expect(usernameKey("kaizen_studio")).toBe(usernameKey("KaizenStudio"));
    expect(usernameKey("KaizenStudio")).toBe(usernameKey("ka1zenstudi0"));
    expect((await post("/api/auth/signup", { username: "kaizenstudio", password: "password123" })).status).toBe(201);
    const duplicate = await post("/api/auth/signup", { username: "kaizen_studio", password: "password123" });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      error: "username_taken",
      message: "That username is taken or too close to an existing one. If it's yours, log in instead.",
    });
    expect((await post("/api/auth/login", { username: "Kaizenstudio", password: "password123" })).status).toBe(200);
    expect((await post("/api/auth/signup", { username: "admin", password: "password123" })).status).toBe(400);
  });

  it("signs up, sets a session cookie and returns the dashboard as next", async () => {
    const response = await post("/api/auth/signup", { username: "Bob_1", password: "password123" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, next: "/dashboard" });
    expect(response.headers.get("set-cookie")).toMatch(/^mcp_session=.+HttpOnly/i);
  });

  it("rejects an existing username with the wrong password and weak credentials", async () => {
    const duplicate = await post("/api/auth/signup", { username: "bob_1", password: "different-password" });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      error: "username_taken",
      message: "That username is taken or too close to an existing one. If it's yours, log in instead.",
    });
    expect((await post("/api/auth/signup", { username: "x", password: "password123" })).status).toBe(400);
    expect((await post("/api/auth/signup", { username: "carol", password: "short" })).status).toBe(400);
  });

  it("logs into an existing account when signup is repeated with the same password", async () => {
    const username = "repeat_user";
    expect((await post("/api/auth/signup", { username, password: "password123" })).status).toBe(201);
    const response = await post("/api/auth/signup", { username, password: "password123" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, next: "/dashboard" });
    expect(response.headers.get("set-cookie")).toMatch(/^mcp_session=.+HttpOnly/i);
  });

  it("logs in with the right password only, and keeps next on this site", async () => {
    const wrongPassword = await post("/api/auth/login", { username: "bob_1", password: "nope-nope" });
    expect(wrongPassword.status).toBe(401);
    expect(await wrongPassword.json()).toMatchObject({ error: "invalid_login", message: "Wrong username or password." });
    const unknownUser = await post("/api/auth/login", { username: "nobody", password: "password123" });
    expect(unknownUser.status).toBe(401);
    expect(await unknownUser.json()).toEqual({
      error: "unknown_user",
      message: "No account with that username. Create one — it takes a few seconds.",
    });
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
    expect(me.user.role).toBe("buyer");
    expect(me.user).not.toHaveProperty("passwordHash");
  });

  it("derives merchant role from the live username list", async () => {
    const { cookie } = await signUp(server.baseUrl, "merchantcase");
    process.env.PAYOUT_ADMIN_USERNAMES = " MerchantCase ,other";
    const me = await (await fetch(`${server.baseUrl}/api/me`, { headers: { cookie } })).json();
    expect(me.user.role).toBe("merchant");
    delete process.env.PAYOUT_ADMIN_USERNAMES;
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
