import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { Environment, SignedDataVerifier } from "@apple/app-store-server-library";
import {
  appleNotificationDeliveriesTable,
  billingOwnerAliasesTable,
  applePurchaseOwnershipTable,
  appleTransactionsTable,
  db,
} from "@workspace/db";
import type { BillingPlan } from "./lib/billing";

const ROOT_CERTIFICATES = [
  "AppleIncRootCertificate.cer",
  "AppleRootCA-G2.cer",
  "AppleRootCA-G3.cer",
];
const BUNDLE_ID = "com.macrocount.app";
const APP_APPLE_ID = 6809140735;

export const APPLE_PRODUCTS = {
  macrocount_weekly_ios: "weekly",
  macrocount_monthly_ios: "monthly",
  macrocount_yearly_ios: "yearly",
} as const satisfies Record<string, BillingPlan>;

export class AppleOwnershipConflictError extends Error {
  constructor() {
    super("This App Store subscription is already linked to another account.");
  }
}

type AppleTransaction = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  environment?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  signedDate?: number;
};
type AppleRenewal = { gracePeriodExpiresDate?: number; isInBillingRetryPeriod?: boolean; signedDate?: number };

let verifierPromise: Promise<{ production: SignedDataVerifier; sandbox: SignedDataVerifier }> | undefined;

async function getVerifiers() {
  verifierPromise ??= Promise.all(
    ROOT_CERTIFICATES.map((name) => readFile(new URL(`./certificates/${name}`, import.meta.url))),
  ).then((roots) => ({
    production: new SignedDataVerifier(
      roots,
      process.env.NODE_ENV !== "test",
      Environment.PRODUCTION,
      BUNDLE_ID,
      APP_APPLE_ID,
    ),
    sandbox: new SignedDataVerifier(
      roots,
      process.env.NODE_ENV !== "test",
      Environment.SANDBOX,
      BUNDLE_ID,
    ),
  }));
  return verifierPromise;
}

export type AppleTransactionVerifier = Pick<SignedDataVerifier, "verifyAndDecodeTransaction">;

/** Production is authoritative; only a failed production signature is retried in Sandbox. */
export async function verifyAppleTransactionWithVerifiers(
  signedTransaction: string,
  verifiers: { production: AppleTransactionVerifier; sandbox: AppleTransactionVerifier },
) {
  try {
    return { transaction: (await verifiers.production.verifyAndDecodeTransaction(signedTransaction)) as AppleTransaction, environment: "Production" };
  } catch {
    return { transaction: (await verifiers.sandbox.verifyAndDecodeTransaction(signedTransaction)) as AppleTransaction, environment: "Sandbox" };
  }
}

export function getApplePlan(productId: string | undefined): BillingPlan {
  const plan = productId && APPLE_PRODUCTS[productId as keyof typeof APPLE_PRODUCTS];
  if (!plan) throw new Error("The App Store product is not a MacroCount subscription.");
  return plan;
}
function asDate(value: number | undefined) {
  return value == null ? null : new Date(value);
}

export async function saveVerifiedAppleTransaction(
  tx: typeof db,
  requestedOwnerId: string | null,
  signedTransaction: string,
  transaction: AppleTransaction,
  renewal?: AppleRenewal,
  environment?: string,
  syntheticRenewalClearAt?: number,
  claimOwnership = true,
) {
  if (!transaction.transactionId || !transaction.originalTransactionId) {
    throw new Error("Apple transaction is missing an identifier.");
  }
  if (transaction.signedDate == null) throw new Error("Apple transaction is missing signedDate.");
  const stateSignedAt = new Date(transaction.signedDate);
  const renewalSignedAt = renewal?.signedDate == null ? null : new Date(renewal.signedDate);
  if (renewal && !renewalSignedAt) throw new Error("Apple renewal is missing signedDate.");
  const syntheticRenewalClear = syntheticRenewalClearAt == null ? null : new Date(syntheticRenewalClearAt);
  getApplePlan(transaction.productId);
  const productId = transaction.productId!;
  let ownerId = requestedOwnerId;
  if (claimOwnership) {
    if (!ownerId) throw new Error("An owner is required to claim an App Store subscription.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`);
    const [alias] = await tx.select({ billingOwnerId: billingOwnerAliasesTable.billingOwnerId })
      .from(billingOwnerAliasesTable).where(eq(billingOwnerAliasesTable.aliasOwnerId, ownerId));
    ownerId = alias?.billingOwnerId ?? ownerId;
  }
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${transaction.originalTransactionId}, 0))`);
  if (claimOwnership) {
    await tx.insert(applePurchaseOwnershipTable).values({
      originalTransactionId: transaction.originalTransactionId,
      ownerId: ownerId!,
      environment: environment ?? transaction.environment ?? "Production",
      productId,
    }).onConflictDoNothing();
  }
  const [ownership] = await tx
    .select()
    .from(applePurchaseOwnershipTable)
    .where(eq(applePurchaseOwnershipTable.originalTransactionId, transaction.originalTransactionId));
  if (claimOwnership && ownership && ownership.ownerId !== ownerId) throw new AppleOwnershipConflictError();
  if (claimOwnership && !ownership) throw new Error("Unable to claim App Store subscription ownership.");
  ownerId = ownership?.ownerId ?? null;
  if (claimOwnership) {
    await tx.update(appleTransactionsTable).set({ ownerId, updatedAt: new Date() })
      .where(eq(appleTransactionsTable.originalTransactionId, transaction.originalTransactionId));
  }
  await tx
    .insert(appleTransactionsTable)
    .values({
      transactionId: transaction.transactionId,
      originalTransactionId: transaction.originalTransactionId,
      ownerId,
      productId,
      environment: environment ?? transaction.environment ?? "Production",
      purchasedAt: asDate(transaction.purchaseDate),
      expiresAt: asDate(transaction.expiresDate),
      gracePeriodExpiresAt: asDate(renewal?.gracePeriodExpiresDate),
      revokedAt: asDate(transaction.revocationDate),
      isInBillingRetry: renewal?.isInBillingRetryPeriod ?? false,
      stateSignedAt,
      renewalStateSignedAt: renewalSignedAt ?? syntheticRenewalClear,
      rawSignedTransaction: signedTransaction,
    })
    .onConflictDoUpdate({
      target: appleTransactionsTable.transactionId,
      set: {
        expiresAt: asDate(transaction.expiresDate),
        revokedAt: asDate(transaction.revocationDate),
        stateSignedAt,
        productId,
        rawSignedTransaction: signedTransaction,
        updatedAt: new Date(),
      },
      where: sql`${appleTransactionsTable.stateSignedAt} < ${stateSignedAt}
        OR (${appleTransactionsTable.stateSignedAt} = ${stateSignedAt}
          AND ${appleTransactionsTable.revokedAt} IS NULL AND ${sql.raw("EXCLUDED.revoked_at IS NOT NULL")})`,
    });
  if (renewalSignedAt) {
    await tx.update(appleTransactionsTable).set({
      gracePeriodExpiresAt: asDate(renewal?.gracePeriodExpiresDate),
      isInBillingRetry: renewal?.isInBillingRetryPeriod ?? false,
      renewalStateSignedAt: renewalSignedAt,
      updatedAt: new Date(),
    }).where(sql`${appleTransactionsTable.transactionId} = ${transaction.transactionId}
      AND (${appleTransactionsTable.renewalStateSignedAt} IS NULL OR ${appleTransactionsTable.renewalStateSignedAt} < ${renewalSignedAt})`);
  } else if (syntheticRenewalClear) {
    await tx.update(appleTransactionsTable).set({
      gracePeriodExpiresAt: null, isInBillingRetry: false, renewalStateSignedAt: syntheticRenewalClear, updatedAt: new Date(),
    }).where(sql`${appleTransactionsTable.transactionId} = ${transaction.transactionId}
      AND (${appleTransactionsTable.renewalStateSignedAt} IS NULL OR ${appleTransactionsTable.renewalStateSignedAt} < ${syntheticRenewalClear}
        OR (${appleTransactionsTable.renewalStateSignedAt} = ${syntheticRenewalClear}
          AND (${appleTransactionsTable.gracePeriodExpiresAt} IS NOT NULL OR ${appleTransactionsTable.isInBillingRetry} = true)))`);
  }
  return { plan: getApplePlan(productId), originalTransactionId: transaction.originalTransactionId };
}

export async function claimAppleTransaction(ownerId: string, signedTransaction: string) {
  const verified = await verifyAppleTransactionWithVerifiers(signedTransaction, await getVerifiers());
  return db.transaction((tx) =>
    saveVerifiedAppleTransaction(tx as unknown as typeof db, ownerId, signedTransaction, verified.transaction, undefined, verified.environment),
  );
}

export async function restoreAppleTransactions(ownerId: string, signedTransactions: string[]) {
  if (signedTransactions.length < 1 || signedTransactions.length > 100) throw new Error("Provide between 1 and 100 transactions.");
  const verifiers = await getVerifiers();
  const verified = await Promise.all(signedTransactions.map((signedTransaction) => verifyAppleTransactionWithVerifiers(signedTransaction, verifiers)));
  return db.transaction(async (tx) => {
    const restored = [];
    for (let index = 0; index < verified.length; index += 1) {
      restored.push(await saveVerifiedAppleTransaction(tx as unknown as typeof db, ownerId, signedTransactions[index], verified[index].transaction, undefined, verified[index].environment));
    }
    return restored;
  });
}

type NotificationVerifier = Pick<SignedDataVerifier, "verifyAndDecodeNotification" | "verifyAndDecodeTransaction" | "verifyAndDecodeRenewalInfo">;
type NotificationDependencies = {
  verifiers?: { production: NotificationVerifier; sandbox: NotificationVerifier };
  database?: Pick<typeof db, "transaction">;
};

export async function processAppleNotification(signedPayload: string, dependencies: NotificationDependencies = {}) {
  const verifiers = dependencies.verifiers ?? await getVerifiers();
  const database = dependencies.database ?? db;
  let payload: any;
  let verifier: NotificationVerifier;
  try {
    payload = await verifiers.production.verifyAndDecodeNotification(signedPayload);
    verifier = verifiers.production;
  } catch {
    payload = await verifiers.sandbox.verifyAndDecodeNotification(signedPayload);
    verifier = verifiers.sandbox;
  }
  const uuid = payload.notificationUUID;
  if (!uuid) throw new Error("Apple notification is missing notificationUUID.");
  const signedTransaction = payload.data?.signedTransactionInfo;
  if (!signedTransaction) return;
  const transaction = (await verifier.verifyAndDecodeTransaction(signedTransaction)) as AppleTransaction;
  const renewal = payload.data?.signedRenewalInfo
    ? (await verifier.verifyAndDecodeRenewalInfo(payload.data.signedRenewalInfo)) as AppleRenewal
    : undefined;
  await database.transaction(async (tx) => {
    const inserted = await tx.insert(appleNotificationDeliveriesTable).values({
      notificationUuid: uuid, notificationType: payload.notificationType, subtype: payload.subtype,
      signedAt: payload.signedDate == null ? null : new Date(payload.signedDate), environment: transaction.environment,
    }).onConflictDoNothing().returning();
    if (!inserted.length) return;
    if (payload.signedDate == null) throw new Error("Apple notification is missing signedDate.");
    transaction.signedDate = Math.max(transaction.signedDate ?? 0, payload.signedDate);
    const terminal = new Set(["DID_RENEW", "EXPIRED", "GRACE_PERIOD_EXPIRED", "REFUND", "REVOKE"]);
    await saveVerifiedAppleTransaction(
      tx as unknown as typeof db, null, signedTransaction, transaction, renewal,
      transaction.environment, renewal ? undefined : terminal.has(payload.notificationType) ? payload.signedDate : undefined,
      false,
    );
  });
}

export async function getActiveAppleEntitlement(ownerId: string) {
  const result = await db.execute(sql`
    SELECT product_id, expires_at, grace_period_expires_at
    FROM apple_transactions
    WHERE owner_id = ${ownerId} AND revoked_at IS NULL
      AND COALESCE(grace_period_expires_at, expires_at) > now()
    ORDER BY COALESCE(grace_period_expires_at, expires_at) DESC NULLS LAST LIMIT 1
  `);
  const row = result.rows[0] as { product_id: string; expires_at: Date | null; grace_period_expires_at: Date | null } | undefined;
  if (!row) return null;
  return { plan: getApplePlan(row.product_id), endsAt: row.grace_period_expires_at ?? row.expires_at };
}