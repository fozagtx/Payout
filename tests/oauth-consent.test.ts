import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signUp, startServer, type TestServer } from "./helpers/harness.js";

let server: TestServer | undefined;
let cookie: string;
let authorizationEndpoint: string;
let registrationEndpoint: string;
let clientId: string;

beforeAll(async () => {
  server = await startServer();
  const signedUp = await signUp(server.baseUrl, "oauth_consent_user");
  cookie = signedUp.cookie;

  const metadata = await (await fetch(`${server.baseUrl}/.well-known/oauth-authorization-server`)).json();
  authorizationEndpoint = metadata.authorization_endpoint;
  registrationEndpoint = metadata.registration_endpoint;

  const registration = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Consent test",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(registration.ok).toBe(true);
  clientId = (await registration.json()).client_id;
});

afterAll(async () => {
  await server?.close();
});

describe("OAuth consent recovery", () => {
  it("returns HTML for bad and reused consent posts and locks the consent form", async () => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorizationUrl = new URL(authorizationEndpoint);
    for (const [key, value] of Object.entries({
      response_type: "code",
      client_id: clientId,
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "shop:browse shop:checkout orders:read",
      resource: `${server!.baseUrl}/mcp`,
    })) {
      authorizationUrl.searchParams.set(key, value);
    }

    const authorization = await fetch(authorizationUrl, { redirect: "manual" });
    const connectUrl = new URL(authorization.headers.get("location")!, server!.baseUrl);
    expect(connectUrl.pathname).toBe("/connect");

    const consentPage = await fetch(connectUrl, { headers: { cookie } });
    const consentHtml = await consentPage.text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(consentHtml)?.[1];
    const requestId = connectUrl.searchParams.get("requestId");
    expect(csrf).toBeTruthy();
    expect(requestId).toBeTruthy();
    expect(consentHtml).toContain("button.disabled = true");
    expect(consentHtml).toContain("Connecting…");
    expect(consentHtml).toContain("Cancelling…");

    const postConsent = (token: string) =>
      fetch(`${server!.baseUrl}/oauth/consent`, {
        method: "POST",
        redirect: "manual",
        headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ requestId: requestId!, csrf: token, decision: "allow" }),
      });
    const isRecoveryPage = async (response: Response) => {
      const body = await response.text();
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(body).toContain("This connection link is no longer valid");
      expect(body).toContain("Connect again");
      expect(body).toContain('href="/dashboard/apps"');
    };

    await isRecoveryPage(await postConsent(`${csrf}wrong`));
    expect((await postConsent(csrf!)).status).toBe(303);
    await isRecoveryPage(await postConsent(csrf!));
  });
});
