import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const claimAppleTransaction = vi.fn();
const restoreAppleTransactions = vi.fn();
vi.mock("../appleBilling", () => ({
  AppleOwnershipConflictError: class AppleOwnershipConflictError extends Error {
    constructor() {
      super("This App Store subscription is already linked to another account.");
    }
  },
  claimAppleTransaction,
  restoreAppleTransactions,
  processAppleNotification: vi.fn(),
}));
vi.mock("./macrosnap", () => ({
  getCurrentOwner: vi.fn(async () => "owner-1"),
}));

const { default: appleRouter } = await import("./apple.js");
const { AppleOwnershipConflictError } = await import("../appleBilling.js");
const app = express();
app.use(express.json());
app.use("/api", appleRouter);

describe("Apple billing routes", () => {
  it("validates, verifies, and restores transactions", async () => {
    claimAppleTransaction.mockResolvedValue({ plan: "monthly", originalTransactionId: "original" });
    restoreAppleTransactions.mockResolvedValue([{ plan: "monthly", originalTransactionId: "original" }]);
    await request(app).post("/api/billing/apple/transaction").send({}).expect(400);
    await request(app).post("/api/billing/apple/transaction").send({ signedTransaction: "signed" }).expect(201);
    await request(app).post("/api/billing/apple/restore").send({ signedTransactions: ["signed"] }).expect(200);
  });

  it("returns ownership conflicts without exposing verification details", async () => {
    claimAppleTransaction.mockRejectedValue(new AppleOwnershipConflictError());
    const response = await request(app)
      .post("/api/billing/apple/transaction")
      .send({ signedTransaction: "signed" })
      .expect(409);
    expect(response.body.error).toMatch(/already linked/i);
  });
});