export interface Config {
  /** Public origin of this server. It is the OAuth issuer, hosts /mcp and the Next.js app. */
  apiUrl: string;
  port: number;
  sessionSecret: string;
  production: boolean;
  /** Proxy hops in front of the server (Express `trust proxy`). 0 when exposed directly. */
  trustProxy: number;
  channel3ApiKey?: string;
  paypal: {
    clientId?: string;
    clientSecret?: string;
    /** Id of the webhook registered in the PayPal app; needed to verify webhook deliveries. */
    webhookId?: string;
    /** Always sandbox unless PAYPAL_ENV=live. */
    baseUrl: string;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError("PORT must be a valid TCP port");
  }
  const sessionSecret = env.SESSION_SECRET ?? "";
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  const trustProxy = Number(env.TRUST_PROXY ?? 1);
  if (!Number.isInteger(trustProxy) || trustProxy < 0) {
    throw new RangeError("TRUST_PROXY must be a whole number of proxy hops");
  }
  return {
    apiUrl: env.PUBLIC_API_URL ?? env.RENDER_EXTERNAL_URL ?? `http://localhost:${port}`,
    port,
    sessionSecret,
    production: env.NODE_ENV === "production",
    trustProxy,
    channel3ApiKey: env.CHANNEL3_API_KEY || undefined,
    paypal: {
      clientId: env.PAYPAL_CLIENT_ID || undefined,
      clientSecret: env.PAYPAL_CLIENT_SECRET || undefined,
      webhookId: env.PAYPAL_WEBHOOK_ID || undefined,
      baseUrl: env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
    },
  };
}
