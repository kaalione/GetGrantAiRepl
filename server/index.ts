import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { apiLimiter, cronLimiter } from "./middleware/rate-limit";
import { setupAuth, registerAuthRoutes } from "./auth";
import { verifyWebhookEvent } from "./lib/stripeClient";
import { handleSubscriptionWebhook } from "./lib/webhookHandlers";
import { handleSuccessFeeWebhook } from "./services/successFeeWebhook";
import { handlePartnerStripeWebhook } from "./services/partnerStripeWebhook";
import { setupCollaborationWS } from "./websocket/collaboration";

const app = express();
const httpServer = createServer(app);

setupCollaborationWS(httpServer);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const port = parseInt(process.env.PORT || "5000", 10);
const allowedOrigins = [
  process.env.APP_URL || null,
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
].filter(Boolean) as string[];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use("/api", apiLimiter);
app.use("/api/cron", cronLimiter);

// Cron endpoints historically take the key as body.apiKey or x-api-key.
// External schedulers (GitHub Actions, Vercel Cron) conventionally send
// "Authorization: Bearer <CRON_API_KEY>" — normalize that to x-api-key so
// every existing check keeps working.
app.use((req, _res, next) => {
  if (!req.headers["x-api-key"]) {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      req.headers["x-api-key"] = auth.slice("Bearer ".length);
    }
  }
  next();
});

// Stripe webhook route MUST be registered BEFORE express.json()
// This is critical - webhook needs raw Buffer, not parsed JSON
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      // Signature verification — rejects the request before any handler runs.
      const event = verifyWebhookEvent(req.body as Buffer, sig);

      await handleSubscriptionWebhook(event);

      try {
        await handleSuccessFeeWebhook(event);
      } catch (sfError) {
        // Non-critical: success fee webhook handling is best-effort
      }

      try {
        await handlePartnerStripeWebhook(event);
      } catch (partnerError) {
        // Non-critical: partner webhook handling is best-effort
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

import { whitelabelMiddleware } from './middleware/whitelabel';
app.use(whitelabelMiddleware);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Setup auth BEFORE registering other routes
  await setupAuth(app);
  registerAuthRoutes(app);
  
  await registerRoutes(httpServer, app);

  // Seed database with sample data
  try {
    await seedDatabase();
  } catch (error) {
    console.error("Failed to seed database:", error);
  }

  // Close expired grants on startup
  try {
    const { db } = await import('./db');
    const { grants } = await import('@shared/schema');
    const { eq, sql, and, lt } = await import('drizzle-orm');
    const result = await db
      .update(grants)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(
        and(
          sql`${grants.status} IN ('open', 'upcoming')`,
          lt(grants.deadline, new Date())
        )
      )
      .returning({ id: grants.id });
    if (result.length > 0) {
      console.log(`[Grants] Closed ${result.length} expired grants on startup`);
    }
  } catch (error) {
    console.error("Failed to close expired grants:", error);
  }

  // Initialize partner scheduled jobs
  try {
    const { initPartnerJobs } = await import('./jobs/partnerJobs');
    initPartnerJobs();
  } catch (error) {
    console.error("Failed to initialize partner jobs:", error);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Serve API and client on PORT (default 5000). HOST defaults to 0.0.0.0 so
  // the same setup works locally and in containers.
  httpServer.listen(
    {
      port,
      host: process.env.HOST || "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
