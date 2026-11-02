import type { Config } from "../config.js";
import type { Database } from "../db/client.js";
import { createStorefront } from "./channel3/storefront.js";
import { createPayPalPayments } from "./paypal/client.js";
import { createStoreCatalog } from "./store/catalog.js";
import type { Services } from "./services.js";

/** The real store catalog + Channel3 + PayPal sandbox services, from env config. */
export function createLiveServices(config: Config, db: Database): Services {
  return {
    catalog: createStoreCatalog(db),
    ...(config.channel3ApiKey ? { storefront: createStorefront(config.channel3ApiKey) } : {}),
    payments: createPayPalPayments({
      clientId: config.paypal.clientId,
      clientSecret: config.paypal.clientSecret,
      webhookId: config.paypal.webhookId,
      baseUrl: config.paypal.baseUrl,
    }),
    publicUrl: config.apiUrl,
    imageSecret: config.sessionSecret,
  };
}
