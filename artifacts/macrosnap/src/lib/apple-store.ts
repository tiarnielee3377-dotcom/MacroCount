import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type ApplePlan = "weekly" | "monthly" | "yearly";

export interface AppleProduct {
  id: string;
  plan: ApplePlan;
  displayName: string;
  description: string;
  displayPrice: string;
}

interface ApplePurchaseResult {
  transactionId: string;
  signedTransaction: string;
}

interface AppleRestoreResult {
  transactions: ApplePurchaseResult[];
}

interface AppleStorePlugin {
  getProducts(): Promise<{ products: AppleProduct[] }>;
  purchase(options: { productId: string }): Promise<ApplePurchaseResult>;
  restore(): Promise<AppleRestoreResult>;
  recover(): Promise<AppleRestoreResult>;
  finish(options: { transactionId: string }): Promise<void>;
  addListener(
    eventName: "transactionUpdated",
    listener: (transaction: ApplePurchaseResult) => void,
  ): Promise<PluginListenerHandle>;
}

const AppleStore = registerPlugin<AppleStorePlugin>("AppleStore");

export function isNativeIOS() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function getAppleProducts() {
  return (await AppleStore.getProducts()).products;
}

export async function purchaseAppleProduct(productId: string) {
  return AppleStore.purchase({ productId });
}

export async function restoreApplePurchases() {
  return (await AppleStore.restore()).transactions;
}

export async function recoverApplePurchases() {
  return (await AppleStore.recover()).transactions;
}

export function addAppleTransactionListener(listener: (transaction: ApplePurchaseResult) => void) {
  return AppleStore.addListener("transactionUpdated", listener);
}

export async function finishAppleTransaction(transactionId: string) {
  await AppleStore.finish({ transactionId });
}