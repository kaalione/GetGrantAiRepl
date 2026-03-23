import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      const now = new Date();
      const [user] = await db
        .insert(users)
        .values({ ...userData, lastLoginAt: now })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            ...userData,
            lastLoginAt: now,
            updatedAt: now,
          },
        })
        .returning();
      return user;
    } catch (error: any) {
      if (error?.code === '23505' && error?.constraint?.includes('email')) {
        const [existing] = await db.select().from(users).where(eq(users.email, userData.email!));
        if (existing) {
          const now = new Date();
          const [updated] = await db
            .update(users)
            .set({ ...userData, lastLoginAt: now, updatedAt: now })
            .where(eq(users.id, existing.id))
            .returning();
          return updated;
        }
      }
      throw error;
    }
  }
}

export const authStorage = new AuthStorage();
