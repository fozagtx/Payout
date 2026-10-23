import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import express from "express";

/**
 * A small signed image proxy. The MCP Apps canvas runs under a strict CSP that
 * only allows images from listed origins, but Channel3 products come from any
 * merchant CDN. The catalog tools rewrite those URLs to
 * `${publicUrl}/img?u=<url>&s=<hmac>`, and this route fetches them.
 *
 * Only URLs this server signed are fetched, only over https, never from
 * private/loopback addresses (checked on the address actually connected to,
 * so DNS rebinding can't sneak past), without following redirects, with a
 * timeout, a size cap, and only image/* responses.
 */

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 5 * 1024 * 1024;

function signature(secret: string, url: string) {
  return createHmac("sha256", secret).update(`payout-img:${url}`).digest("base64url");
}

export function signImageUrl(publicUrl: string, secret: string, url: string) {
  return `${publicUrl.replace(/\/+$/, "")}/img?u=${encodeURIComponent(url)}&s=${signature(secret, url)}`;
}

export function verifyImageSignature(secret: string, url: string, given: string) {
  const expected = Buffer.from(signature(secret, url));
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:xxxx:xxxx) → the IPv4 address. */
function mappedIPv4(address: string) {
  const match = /^(?:::|(?:0{1,4}:){5})ffff:(.+)$/i.exec(address);
  if (!match) return undefined;
  const tail = match[1]!;
  if (isIP(tail) === 4) return tail;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
  if (!hex) return undefined;
  const high = parseInt(hex[1]!, 16);
  const low = parseInt(hex[2]!, 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved and documentation ranges. */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const family = isIP(bare);
  if (family === 4) return blocked.check(bare, "ipv4");
  if (family === 6) {
    const v4 = mappedIPv4(bare);
    if (v4) return blocked.check(v4, "ipv4");
    return blocked.check(bare, "ipv6");
  }
  return true; // not an IP at all: refuse
}

class RefusedError extends Error {
  code = "EREFUSED_PRIVATE";
}

/** dns.lookup, refusing any private answer. Used as the socket's lookup, so the checked address is the one dialed. */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 4);
    const list = addresses as LookupAddress[];
    if (list.length === 0) return callback(new Error(`no address for ${hostname}`), "", 4);
    if (list.some((entry) => isPrivateAddress(entry.address))) {
      return callback(new RefusedError(`refusing private address for ${hostname}`), "", 4);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
};

type Upstream = { status: number; contentType: string; body: Buffer };

function fetchImage(target: URL): Promise<Upstream> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      target,
      {
        method: "GET",
        lookup: safeLookup,
        headers: { accept: "image/*", "user-agent": "PayoutImageProxy/1.0" },
        timeout: TIMEOUT_MS,
      },
      (response) => {
        const status = response.statusCode ?? 502;
        const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
        if (status !== 200 || !contentType.startsWith("image/")) {
          response.resume();
          resolve({ status, contentType, body: Buffer.alloc(0) });
          return;
        }
        const declared = Number(response.headers["content-length"] ?? 0);
        if (declared > MAX_BYTES) {
          request.destroy();
          reject(new Error("too_large"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            request.destroy(new Error("too_large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, contentType, body: Buffer.concat(chunks) }));
        response.on("error", reject);
      }
    );
    const deadline = setTimeout(() => request.destroy(new Error("timeout")), TIMEOUT_MS);
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.on("close", () => clearTimeout(deadline));
    request.end();
  });
}

export function createImageRouter(secret: string) {
  const router = express.Router();

  router.get("/img", async (request, response) => {
    const url = typeof request.query.u === "string" ? request.query.u : "";
    const given = typeof request.query.s === "string" ? request.query.s : "";
    if (!url || !given) {
      response.status(400).json({ error: "missing_parameters" });
      return;
    }
    if (!verifyImageSignature(secret, url, given)) {
      response.status(403).json({ error: "bad_signature" });
      return;
    }
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      response.status(400).json({ error: "invalid_url" });
      return;
    }
    if (target.protocol !== "https:" || target.username || target.password) {
      response.status(400).json({ error: "https_only" });
      return;
    }
    const host = target.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || (isIP(host) && isPrivateAddress(host))) {
      response.status(403).json({ error: "private_address" });
      return;
    }

    try {
      const upstream = await fetchImage(target);
      if (upstream.status !== 200) {
        response.status(502).json({ error: "upstream_status", status: upstream.status });
        return;
      }
      if (!upstream.contentType.startsWith("image/") || upstream.contentType.includes("svg")) {
        response.status(502).json({ error: "not_an_image" });
        return;
      }
      response.set({
        "content-type": upstream.contentType,
        "content-length": String(upstream.body.length),
        "cache-control": "public, max-age=86400, immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "cross-origin-resource-policy": "cross-origin",
      });
      response.end(upstream.body);
    } catch (error) {
      if (error instanceof RefusedError) {
        response.status(403).json({ error: "private_address" });
        return;
      }
      const message = error instanceof Error ? error.message : "";
      response.status(message === "too_large" ? 413 : message === "timeout" ? 504 : 502).json({ error: "upstream_failed" });
    }
  });

  return router;
}
