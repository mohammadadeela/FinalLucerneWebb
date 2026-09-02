import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

// Sessions are stored in Postgres by connect-pg-simple (table "session",
// jsonb column "sess" shaped like { passport: { user: <id> }, cookie: {...} }).
// When an admin blocks or deletes a user, we delete their session rows
// directly so the browser's existing cookie is immediately worthless — the
// very next request they make anywhere on the site comes back unauthenticated,
// instead of waiting for that specific route to notice isBlocked.
export async function destroyUserSessions(userId: number): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM "session" WHERE (sess -> 'passport' ->> 'user')::int = $1`,
      [userId],
    );
  } catch (err) {
    console.error("[auth] Failed to destroy sessions for user", userId, err);
  }
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  if (!stored || !stored.includes(".")) return false;
  const dotIdx = stored.indexOf(".");
  const hashed = stored.slice(0, dotIdx);
  const salt = stored.slice(dotIdx + 1);
  if (!hashed || !salt) return false;
  try {
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    if (hashedBuf.length !== suppliedBuf.length) return false;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch {
    return false;
  }
}

export function setupAuth(app: Express) {
  const PostgresStore = connectPg(session);
  app.set("trust proxy", 1);
  app.use(
    session({
      secret: (() => {
        const s = process.env.SESSION_SECRET;
        if (s && s.length >= 16) return s;
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            "SESSION_SECRET env var is required in production (min 16 chars). Set it in your Hostinger environment.",
          );
        }
        console.warn("[auth] SESSION_SECRET not set — using dev-only fallback");
        return "dev-only-insecure-secret-do-not-use-in-prod";
      })(),
      resave: false,
      saveUninitialized: false,
      // Rolling sessions: the expiry clock resets on every visit, so active
      // customers stay logged in indefinitely. Only sessions untouched for
      // the full 90 days expire.
      rolling: true,
      store: new PostgresStore({
        pool,
        createTableIfMissing: true,
      }),
      cookie: {
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days, renewed on each visit
        secure: true,
        sameSite: "none" as const,
        httpOnly: true,
      }
    }),
  );

  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const user = await storage.getUserByEmail(email);
        if (!user) {
          return done(null, false, { message: "email_not_found" });
        }
        if (user.isBlocked) {
          return done(null, false, { message: "account_blocked" });
        }
        // Accounts created via Google/Firebase sign-in store a random UUID as
        // a placeholder password (no "hash.salt" format, since the user never
        // set a site password). Trying to log in with email+password on such
        // an account can never succeed — tell them clearly instead of a
        // generic "wrong password".
        if (!user.password.includes(".")) {
          return done(null, false, { message: "google_account" });
        }
        if (!(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "invalid_password" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      // Backstop for destroyUserSessions: if a stray session somehow
      // survives (e.g. it was created after the DELETE ran, or the DELETE
      // failed), a blocked or deleted account must still never come back
      // as authenticated. done(null, false) makes req.isAuthenticated()
      // false immediately, on this very request.
      if (!user || user.isBlocked) {
        return done(null, false);
      }
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.use(passport.initialize());
  app.use(passport.session());
  
  return { hashPassword };
}
