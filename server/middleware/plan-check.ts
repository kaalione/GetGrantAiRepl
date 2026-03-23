import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

type PlanLevel = "free" | "pro" | "enterprise";

const planHierarchy: Record<PlanLevel, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

export function requirePlan(minPlan: PlanLevel) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({
          error: "Authentication required",
          message: "Du måste vara inloggad för att använda denna funktion.",
        });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const userPlan = (user?.plan || "free") as PlanLevel;
      
      const userPlanLevel = planHierarchy[userPlan] || 0;
      const requiredPlanLevel = planHierarchy[minPlan];

      if (userPlanLevel < requiredPlanLevel) {
        return res.status(402).json({
          error: "Upgrade required",
          message: `Denna funktion kräver ${minPlan.toUpperCase()}-plan`,
          upgradeUrl: "/priser",
          currentPlan: userPlan,
          requiredPlan: minPlan,
        });
      }

      next();
    } catch (error) {
      console.error("Plan check error:", error);
      return res.status(500).json({ error: "Failed to verify subscription" });
    }
  };
}

export async function getUserPlan(userId: string): Promise<PlanLevel> {
  if (!userId) return "free";
  
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return (user?.plan as PlanLevel) || "free";
}

export function canAccessFeature(plan: PlanLevel, requiredPlan: PlanLevel): boolean {
  return planHierarchy[plan] >= planHierarchy[requiredPlan];
}
