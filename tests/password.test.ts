import { describe, expect, it } from "vitest";
import { hashPassword, validateCredentials, verifyPassword } from "../src/lib/password.js";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("wrong horse", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "plain")).toBe(false);
    expect(await verifyPassword("x", "md5$a$b")).toBe(false);
  });
});

describe("validateCredentials", () => {
  it("accepts a normal username and password", () => {
    expect(validateCredentials("alice_1", "longenough")).toBeUndefined();
  });
  it.each([["ab"], ["Has Space"], ["UPPER"], ["a".repeat(33)]])("rejects username %s", (u) => {
    expect(validateCredentials(u, "longenough")).toMatch(/Username/);
  });
  it("rejects short passwords", () => {
    expect(validateCredentials("alice", "short")).toMatch(/Password/);
  });
});
