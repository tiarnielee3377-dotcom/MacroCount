import { describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@workspace/db", () => ({
  db: { execute },
  appleNotificationDeliveriesTable: {},
  applePurchaseOwnershipTable: {},
  appleTransactionsTable: {},
  billingOwnerAliasesTable: {},
}));

const { getActiveAppleEntitlement, getApplePlan, processAppleNotification, saveVerifiedAppleTransaction, verifyAppleTransactionWithVerifiers, AppleOwnershipConflictError } =
  await import("./appleBilling.js");

function transactionStore(existingOwner: string | null, duplicateNotifications = false) {
  let notificationAttempts = 0;
  let transactionWrites = 0;
  const tx = {
    execute: async () => ({}),
    select: () => ({ from: () => ({ where: async () => existingOwner ? [{ ownerId: existingOwner }] : [] }) }),
    update: () => ({ set: () => ({ where: async () => [] }) }),
    insert: () => {
      const chain = {
        values: () => chain,
        onConflictDoNothing: () => ({
          returning: async () => {
            notificationAttempts += 1;
            return duplicateNotifications && notificationAttempts > 1 ? [] : [{}];
          },
        }),
        onConflictDoUpdate: async () => {
          transactionWrites += 1;
          return [];
        },
      };
      return chain;
    },
  };
  return { tx, transactionWrites: () => transactionWrites };
}

const verifiedTransaction = {
  transactionId: "transaction-1",
  originalTransactionId: "original-1",
  productId: "macrocount_monthly_ios",
  expiresDate: Date.now() + 60_000,
  signedDate: Date.now(),
};

describe("Apple billing verification helpers", () => {
  it("maps only the three approved iOS products", () => {
    expect(getApplePlan("macrocount_weekly_ios")).toBe("weekly");
    expect(getApplePlan("macrocount_monthly_ios")).toBe("monthly");
    expect(getApplePlan("macrocount_yearly_ios")).toBe("yearly");
    expect(() => getApplePlan("com.example.untrusted")).toThrow(/not a MacroCount/i);
  });

  it("tries Production before falling back to Sandbox", async () => {
    const production = { verifyAndDecodeTransaction: vi.fn().mockRejectedValue(new Error("sandbox")) };
    const sandbox = { verifyAndDecodeTransaction: vi.fn().mockResolvedValue({
      transactionId: "sandbox-tx", originalTransactionId: "original", productId: "macrocount_monthly_ios",
    }) };
    const result = await verifyAppleTransactionWithVerifiers("signed", { production, sandbox });
    expect(result.environment).toBe("Sandbox");
    expect(production.verifyAndDecodeTransaction).toHaveBeenCalledWith("signed");
    expect(sandbox.verifyAndDecodeTransaction).toHaveBeenCalledWith("signed");
  });

  it("uses only Production when it verifies", async () => {
    const production = { verifyAndDecodeTransaction: vi.fn().mockResolvedValue({
      transactionId: "production-tx", originalTransactionId: "original", productId: "macrocount_yearly_ios",
    }) };
    const sandbox = { verifyAndDecodeTransaction: vi.fn() };
    await expect(verifyAppleTransactionWithVerifiers("signed", { production, sandbox })).resolves.toMatchObject({
      environment: "Production",
    });
    expect(sandbox.verifyAndDecodeTransaction).not.toHaveBeenCalled();
  });

  it("returns access only for a database-selected active or grace transaction", async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    await expect(getActiveAppleEntitlement("owner")).resolves.toBeNull(); // expired/revoked rows are excluded by SQL
    execute.mockResolvedValueOnce({ rows: [{
      product_id: "macrocount_weekly_ios", expires_at: new Date(Date.now() - 1), grace_period_expires_at: new Date(Date.now() + 60_000),
    }] });
    await expect(getActiveAppleEntitlement("owner")).resolves.toMatchObject({ plan: "weekly" });
  });

  it("rejects an original transaction already owned by someone else and accepts its owner", async () => {
    const conflicting = transactionStore("other-owner");
    await expect(saveVerifiedAppleTransaction(conflicting.tx as never, "owner", "signed", verifiedTransaction)).rejects.toBeInstanceOf(AppleOwnershipConflictError);
    const owned = transactionStore("owner");
    await expect(saveVerifiedAppleTransaction(owned.tx as never, "owner", "signed", verifiedTransaction)).resolves.toMatchObject({
      originalTransactionId: "original-1",
    });
  });

  it("does not update a transaction twice for a duplicate notification UUID", async () => {
    const store = transactionStore("owner", true);
    const verifier = {
      verifyAndDecodeNotification: vi.fn().mockResolvedValue({
        notificationUUID: "notification-1",
        signedDate: Date.now(),
        data: { signedTransactionInfo: "transaction-jws" },
      }),
      verifyAndDecodeTransaction: vi.fn().mockResolvedValue(verifiedTransaction),
      verifyAndDecodeRenewalInfo: vi.fn(),
    };
    const database = { transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(store.tx) };
    await processAppleNotification("notification-jws", { verifiers: { production: verifier, sandbox: verifier }, database: database as never });
    await processAppleNotification("notification-jws", { verifiers: { production: verifier, sandbox: verifier }, database: database as never });
    expect(store.transactionWrites()).toBe(1);
  });
});