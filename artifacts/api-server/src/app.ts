import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
import { appleWebhook } from "./routes/apple";

const app: Express = express();
const NATIVE_APP_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
]);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing Stripe signature." });
      return;
    }

    try {
      const value = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, value);
      res.status(200).json({ received: true });
    } catch (error) {
      req.log.error({ err: error }, "Stripe webhook processing failed");
      res.status(400).json({ error: "Webhook processing failed." });
    }
  },
);
app.post("/api/apple/webhook", express.json({ limit: "1mb" }), appleWebhook);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      callback(null, !origin || NATIVE_APP_ORIGINS.has(origin));
    },
  }),
);
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

export default app;
