import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createImageRouter,
  isPrivateAddress,
  signImageUrl,
  verifyImageSignature,
} from "../src/project/api/images.js";

const SECRET = "image-secret-image-secret-image-secret";

describe("image URL signing", () => {
  it("builds a /img URL with the encoded target and an HMAC", () => {
    const signed = new URL(signImageUrl("https://payout.example/", SECRET, "https://cdn.shop.example/a b.jpg?x=1&y=2"));
    expect(signed.origin).toBe("https://payout.example");
    expect(signed.pathname).toBe("/img");
    expect(signed.searchParams.get("u")).toBe("https://cdn.shop.example/a b.jpg?x=1&y=2");
    const s = signed.searchParams.get("s")!;
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyImageSignature(SECRET, signed.searchParams.get("u")!, s)).toBe(true);
  });

  it("rejects a tampered URL, a wrong secret and junk signatures", () => {
    const signed = new URL(signImageUrl("https://payout.example", SECRET, "https://cdn.shop.example/a.jpg"));
    const s = signed.searchParams.get("s")!;
    expect(verifyImageSignature(SECRET, "https://cdn.shop.example/b.jpg", s)).toBe(false);
    expect(verifyImageSignature("other-secret-other-secret-other-secret", "https://cdn.shop.example/a.jpg", s)).toBe(false);
    expect(verifyImageSignature(SECRET, "https://cdn.shop.example/a.jpg", "")).toBe(false);
    expect(verifyImageSignature(SECRET, "https://cdn.shop.example/a.jpg", "abc")).toBe(false);
  });
});

describe("private address detection", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1",
  ])("%s is private", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "151.101.1.1", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"])("%s is public", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe("GET /img", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    app.use(createImageRouter(SECRET));
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const get = (target: string, signature?: string) => {
    const signed = new URL(signImageUrl(base, SECRET, target));
    if (signature !== undefined) signed.searchParams.set("s", signature);
    return fetch(signed);
  };

  it("refuses requests without a valid signature", async () => {
    expect((await fetch(`${base}/img`)).status).toBe(400);
    expect((await get("https://images.example/a.jpg", "bad")).status).toBe(403);
  });

  it("refuses non-https URLs even when signed", async () => {
    expect((await get("http://images.example/a.jpg")).status).toBe(400);
    expect((await get("file:///etc/passwd")).status).toBe(400);
    expect((await get("not a url")).status).toBe(400);
  });

  it("refuses loopback and private hosts even when signed", async () => {
    expect((await get("https://127.0.0.1/a.jpg")).status).toBe(403);
    expect((await get("https://[::1]/a.jpg")).status).toBe(403);
    expect((await get("https://169.254.169.254/latest/meta-data")).status).toBe(403);
    expect((await get("https://10.0.0.5/a.jpg")).status).toBe(403);
    expect((await get("https://localhost/a.jpg")).status).toBe(403);
  });

  it("refuses hosts that don't resolve", async () => {
    expect((await get("https://does-not-exist.invalid/a.jpg")).status).toBe(502);
  });
});
