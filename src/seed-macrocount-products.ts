import { getUncachableStripeClient } from "./stripeClient";

const PRODUCT_KEY = "macrocount_subscription";
const PLANS = [
  {
    plan: "weekly",
    lookupKey: "macrocount_weekly",
    unitAmount: 999,
    interval: "week" as const,
    nickname: "MacroCount Weekly",
  },
  {
    plan: "monthly",
    lookupKey: "macrocount_monthly",
    unitAmount: 3900,
    interval: "month" as const,
    nickname: "MacroCount Monthly",
  },
  {
    plan: "yearly",
    lookupKey: "macrocount_yearly",
    unitAmount: 19900,
    interval: "year" as const,
    nickname: "MacroCount Yearly",
  },
] as const;
const LEGACY_LOOKUP_KEYS = ["macrocount_annual"] as const;

function isCurrentPrice(
  price: {
    active: boolean;
    currency: string;
    unit_amount: number | null;
    recurring: { interval: string } | null;
  },
  plan: (typeof PLANS)[number],
) {
  return (
    price.active &&
    price.currency === "usd" &&
    price.unit_amount === plan.unitAmount &&
    price.recurring?.interval === plan.interval
  );
}

async function seedProducts() {
  const stripe = await getUncachableStripeClient();
  const matchingProducts = await stripe.products.search({
    query: `metadata['macrocount_product']:'${PRODUCT_KEY}' AND active:'true'`,
  });

  const product =
    matchingProducts.data[0] ??
    (await stripe.products.create({
      name: "MacroCount Premium",
      description: "Unlimited MacroCount food logging, recipes, meal planning, and workouts.",
      metadata: { macrocount_product: PRODUCT_KEY },
    }));

  for (const plan of PLANS) {
    const existing = await stripe.prices.list({
      active: true,
      lookup_keys: [plan.lookupKey],
      limit: 1,
    });
    const currentPrice = existing.data[0];
    if (currentPrice && isCurrentPrice(currentPrice, plan)) {
      console.info(`Using ${plan.nickname}: ${existing.data[0].id}`);
      continue;
    }

    const price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: plan.unitAmount,
      recurring: { interval: plan.interval },
      lookup_key: plan.lookupKey,
      transfer_lookup_key: Boolean(currentPrice),
      nickname: plan.nickname,
      metadata: { macrocount_plan: plan.plan },
    });
    if (currentPrice && currentPrice.id !== price.id) {
      await stripe.prices.update(currentPrice.id, { active: false });
    }
    console.info(`Created ${plan.nickname}: ${price.id}`);
  }

  for (const legacyLookupKey of LEGACY_LOOKUP_KEYS) {
    const legacyPrices = await stripe.prices.list({
      active: true,
      lookup_keys: [legacyLookupKey],
      limit: 100,
    });
    for (const price of legacyPrices.data) {
      await stripe.prices.update(price.id, { active: false });
      console.info(`Archived legacy price: ${price.id}`);
    }
  }
}

seedProducts().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});