import { Router, type IRouter, type Request, type Response } from "express";
import {
  AppleOwnershipConflictError,
  claimAppleTransaction,
  processAppleNotification,
  restoreAppleTransactions,
} from "../appleBilling";
import { getCurrentOwner } from "./macrosnap";

const router: IRouter = Router();

function signedTransactionFrom(body: unknown) {
  const value = (body as { signedTransaction?: unknown })?.signedTransaction;
  return typeof value === "string" && value.length > 0 ? value : null;
}

router.post("/billing/apple/transaction", async (req, res): Promise<void> => {
  const signedTransaction = signedTransactionFrom(req.body);
  if (!signedTransaction) {
    res.status(400).json({ error: "signedTransaction is required." });
    return;
  }
  try {
    const ownerId = await getCurrentOwner(req, res);
    res.status(201).json(await claimAppleTransaction(ownerId, signedTransaction));
  } catch (error) {
    if (error instanceof AppleOwnershipConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    req.log.warn({ err: error }, "Apple transaction verification failed");
    res.status(400).json({ error: "Unable to verify App Store transaction." });
  }
});

router.post("/billing/apple/restore", async (req, res): Promise<void> => {
  const signedTransactions = (req.body as { signedTransactions?: unknown })?.signedTransactions;
  if (!Array.isArray(signedTransactions) || !signedTransactions.every((item) => typeof item === "string" && item.length > 0)) {
    res.status(400).json({ error: "signedTransactions must be an array of signed transactions." });
    return;
  }
  try {
    const ownerId = await getCurrentOwner(req, res);
    res.json({ restored: await restoreAppleTransactions(ownerId, signedTransactions) });
  } catch (error) {
    if (error instanceof AppleOwnershipConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    req.log.warn({ err: error }, "Apple restore failed");
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to restore App Store purchases." });
  }
});

/** App Store Server Notifications v2 are independently signed; Stripe raw body remains untouched. */
export async function appleWebhook(req: Request, res: Response): Promise<void> {
  const signedPayload = (req.body as { signedPayload?: unknown })?.signedPayload;
  if (typeof signedPayload !== "string") {
    res.status(400).json({ error: "signedPayload is required." });
    return;
  }
  try {
    await processAppleNotification(signedPayload);
    res.status(200).json({ received: true });
  } catch (error) {
    req.log.error({ err: error }, "Apple webhook processing failed");
    res.status(400).json({ error: "Webhook processing failed." });
  }
}

export default router;