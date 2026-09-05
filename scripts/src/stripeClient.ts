import Stripe from "stripe";

async function getStripeCredentials(): Promise<{ secretKey: string }> {
  const configuredSecretKey = process.env.STRIPE_SECRET_KEY;
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error("Stripe is not connected to this MacroCount workspace.");
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Unable to load the Stripe connection (${response.status}).`);
  }

  const data = (await response.json()) as {
    items?: Array<{ settings?: { secret_key?: string; secret?: string } }>;
  };
  const settings = data.items?.[0]?.settings;
  const secretKey = settings?.secret_key ?? settings?.secret ?? configuredSecretKey;
  if (!secretKey) {
    throw new Error("The connected Stripe account is missing its secret key.");
  }
  return { secretKey };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}