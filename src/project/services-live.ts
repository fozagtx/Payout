import type { Config } from "../config.js";
import { createChannel3Catalog } from "./channel3/client.js";
import { createPayPalPayments } from "./paypal/client.js";
import type { Services } from "./services.js";

/** The real Channel3 + PayPal sandbox services, from env config. */
export function createLiveServices(config: Config): Services {
  return {
    catalog: createChannel3Catalog({ apiKey: config.channel3ApiKey }),
    payments: createPayPalPayments({
      clientId: config.paypal.clientId,
      clientSecret: config.paypal.clientSecret,
      baseUrl: config.paypal.baseUrl,
    }),
    publicUrl: config.apiUrl,
    imageSecret: config.sessionSecret,
  };
}
