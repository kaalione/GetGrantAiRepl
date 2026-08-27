import { users, type User } from "@shared/models/auth";
import { db } from "../db";
import { eq } from "drizzle-orm";

export interface AuthProfile {
  authProviderId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  findOrCreateUser(profile: AuthProfile): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  // Resolves a Supabase identity to an app user:
  // 1. by auth_provider_id (returning user)
  // 2. by verified email (links a legacy Replit-era account on first login)
  // 3. otherwise creates a new user row
  async findOrCreateUser(profile: AuthProfile): Promise<User> {
    const now = new Date();
    const profileFields = {
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      profileImageUrl: profile.profileImageUrl,
    };

    const [byProvider] = await db
      .select()
      .from(users)
      .where(eq(users.authProviderId, profile.authProviderId));
    if (byProvider) {
      const [updated] = await db
        .update(users)
        .set({ ...profileFields, lastLoginAt: now, updatedAt: now })
        .where(eq(users.id, byProvider.id))
        .returning();
      return updated;
    }

    if (profile.email) {
      const [byEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, profile.email));
      if (byEmail) {
        const [linked] = await db
          .update(users)
          .set({
            ...profileFields,
            authProviderId: profile.authProviderId,
            lastLoginAt: now,
            updatedAt: now,
          })
          .where(eq(users.id, byEmail.id))
          .returning();
        return linked;
      }
    }

    const [created] = await db
      .insert(users)
      .values({
        ...profileFields,
        authProviderId: profile.authProviderId,
        lastLoginAt: now,
      })
      .returning();
    return created;
  }
}

export const authStorage = new AuthStorage();
