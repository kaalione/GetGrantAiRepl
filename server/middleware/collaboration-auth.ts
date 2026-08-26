import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { applicationCollaborators, applications, companies } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export type CollaborationRole = 'owner' | 'editor' | 'commenter' | 'viewer';

const ROLE_HIERARCHY: Record<CollaborationRole, number> = {
  viewer: 0,
  commenter: 1,
  editor: 2,
  owner: 3,
};

export function requireApplicationAccess(requiredRole: CollaborationRole = 'viewer') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const applicationId = (req.params.id || req.params.applicationId) as string;
    const userId = (req as any).user?.claims?.sub;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID required' });
    }

    try {
      const [application] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1);

      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }

      const [company] = application.companyId
        ? await db
            .select()
            .from(companies)
            .where(eq(companies.id, application.companyId!))
            .limit(1)
        : [null];

      if (company?.userId === userId) {
        (req as any).applicationRole = 'owner';
        (req as any).application = application;
        return next();
      }

      const [collaborator] = await db
        .select()
        .from(applicationCollaborators)
        .where(
          and(
            eq(applicationCollaborators.applicationId, applicationId),
            eq(applicationCollaborators.userId, userId),
            eq(applicationCollaborators.status, 'accepted')
          )
        )
        .limit(1);

      if (!collaborator) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const userRoleLevel = ROLE_HIERARCHY[collaborator.role as CollaborationRole] ?? 0;
      const requiredLevel = ROLE_HIERARCHY[requiredRole];

      if (userRoleLevel < requiredLevel) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      (req as any).applicationRole = collaborator.role;
      (req as any).application = application;
      next();
    } catch (error) {
      console.error('Collaboration auth error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}
