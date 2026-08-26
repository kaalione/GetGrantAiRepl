import session from "express-session";
import connectPg from "connect-pg-simple";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

export function getSession() {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: SESSION_TTL_MS,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Secure cookies require HTTPS; allow plain HTTP in local development.
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_MS,
    },
  });
}
