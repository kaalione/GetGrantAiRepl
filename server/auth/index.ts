import passport from "passport";
import type { Express, RequestHandler } from "express";
import { getSession } from "./session";
import { getSupabase } from "./supabase";
import { authStorage } from "./storage";

export { getSession };
export { authStorage };

// The session user keeps the shape the rest of the codebase expects
// (req.user.claims.sub etc.). claims.sub is the app users.id — NOT the
// Supabase id — so every ownership check and foreign key keeps working.
interface SessionUser {
  claims: {
    sub: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    profile_image_url: string | null;
  };
  auth_provider_id: string;
  expires_at: number;
}

// Per-IP rate limiting of unauthenticated/failed requests (carried over
// from the previous auth implementation).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

async function throttleFailedAuth(ip: string) {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60000 };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > 30) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // The whole user object lives in the session row (same behavior as
  // before). The websocket handshake reads sess.passport.user.claims.sub.
  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  if (!getSupabase()) {
    console.warn(
      "[auth] SUPABASE_URL / SUPABASE_ANON_KEY not set — login is disabled."
    );
  }

  // Exchange a Supabase access token (obtained client-side via
  // @supabase/supabase-js) for a server session.
  app.post("/api/auth/session", async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(503).json({ message: "Authentication is not configured" });
    }

    const accessToken = req.body?.access_token;
    if (!accessToken || typeof accessToken !== "string") {
      return res.status(400).json({ message: "access_token is required" });
    }

    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) {
      await throttleFailedAuth(req.ip || "unknown");
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
    const [firstName, ...rest] = fullName.split(" ").filter(Boolean);

    const dbUser = await authStorage.findOrCreateUser({
      authProviderId: data.user.id,
      email: data.user.email ?? null,
      firstName: (typeof meta.first_name === "string" ? meta.first_name : firstName) || null,
      lastName: (typeof meta.last_name === "string" ? meta.last_name : rest.join(" ")) || null,
      profileImageUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
    });

    const sessionUser: SessionUser = {
      claims: {
        sub: dbUser.id,
        email: dbUser.email,
        first_name: dbUser.firstName,
        last_name: dbUser.lastName,
        profile_image_url: dbUser.profileImageUrl,
      },
      auth_provider_id: data.user.id,
      expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    };

    req.login(sessionUser as Express.User, (err) => {
      if (err) {
        console.error("[auth] Failed to establish session:", err);
        return res.status(500).json({ message: "Failed to establish session" });
      }
      res.json(dbUser);
    });
  });

  // Legacy entry points — many pages link to /api/login directly.
  app.get("/api/login", (req, res) => {
    const returnUrl = typeof req.query.returnUrl === "string" ? req.query.returnUrl : null;
    res.redirect(returnUrl ? `/auth?returnUrl=${encodeURIComponent(returnUrl)}` : "/auth");
  });
  app.get("/api/callback", (_req, res) => res.redirect("/auth"));

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session?.destroy(() => {
        res.clearCookie("connect.sid");
        res.redirect("/");
      });
    });
  });
}

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as SessionUser | undefined;

  if (!req.isAuthenticated() || !user?.claims?.sub || !user.expires_at) {
    if (req.session) {
      req.session.destroy(() => {});
    }
    await throttleFailedAuth(req.ip || "unknown");
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > user.expires_at) {
    if (req.session) {
      req.session.destroy(() => {});
    }
    return res.status(401).json({ message: "Unauthorized" });
  }

  return next();
};
