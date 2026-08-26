import { Router } from "express";
import { db } from "../db";
import {
  applicationCollaborators,
  applicationComments,
  applicationSectionHistory,
  applicationPresence,
  applications,
  companies,
  grants,
} from "@shared/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireApplicationAccess } from "../middleware/collaboration-auth";
import { sendEmail } from "../lib/resend";
import { APP_URL } from "../lib/appUrl";
import crypto from "crypto";

const router = Router();

const PRESENCE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
];

function getPresenceColor(index: number): string {
  return PRESENCE_COLORS[index % PRESENCE_COLORS.length];
}

function getAppUrl(): string {
  return APP_URL;
}

function getRoleDescription(role: string): string {
  switch (role) {
    case 'editor': return 'redigera alla sektioner och lämna kommentarer';
    case 'commenter': return 'lämna kommentarer men inte redigera';
    case 'viewer': return 'se ansökan men inte göra ändringar';
    default: return 'se ansökan';
  }
}

function getRoleLabel(role: string): string {
  switch (role) {
    case 'editor': return 'Redigerare';
    case 'commenter': return 'Kommentator';
    case 'viewer': return 'Betraktare';
    case 'owner': return 'Ägare';
    default: return role;
  }
}

// ==========================================
// COLLABORATOR MANAGEMENT
// ==========================================

router.post(
  '/applications/:id/collaborators/invite',
  isAuthenticated,
  requireApplicationAccess('owner'),
  async (req: any, res) => {
    try {
      const applicationId = req.params.id;
      const userId = req.user.claims.sub;
      const inviterName = req.user.claims.first_name
        ? `${req.user.claims.first_name} ${req.user.claims.last_name || ''}`.trim()
        : req.user.claims.email || 'Someone';
      const { email, role } = req.body;

      if (!email || !['editor', 'commenter', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Valid email and role required' });
      }

      const existing = await db
        .select()
        .from(applicationCollaborators)
        .where(
          and(
            eq(applicationCollaborators.applicationId, applicationId),
            eq(applicationCollaborators.email, email.toLowerCase())
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ error: 'This person has already been invited' });
      }

      const inviteToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [collaborator] = await db
        .insert(applicationCollaborators)
        .values({
          applicationId,
          email: email.toLowerCase(),
          role,
          invitedBy: userId,
          status: 'pending',
          inviteToken,
          inviteExpiresAt: expiresAt,
        })
        .returning();

      const application = (req as any).application;
      let grantTitle = 'en bidragsansökan';
      let grantAmount = '';
      let grantDeadline = '';

      if (application?.grantId) {
        const [grant] = await db
          .select()
          .from(grants)
          .where(eq(grants.id, application.grantId))
          .limit(1);
        if (grant) {
          grantTitle = grant.title;
          if (grant.amountMax) grantAmount = `${Number(grant.amountMax).toLocaleString('sv-SE')} SEK`;
          if (grant.deadline) grantDeadline = new Date(grant.deadline).toLocaleDateString('sv-SE');
        }
      }

      const inviteUrl = `${getAppUrl()}/invites/${inviteToken}`;

      try {
        await sendEmail({
          to: email.toLowerCase(),
          subject: `${inviterName} har bjudit in dig till en bidragsansökan på GetGrant.ai`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1a1a2e;">Du har bjudits in att samarbeta</h2>
              <p>Hej,</p>
              <p><strong>${inviterName}</strong> vill samarbeta med dig på ansökan till:</p>
              <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 4px 0;">📋 <strong>${grantTitle}</strong></p>
                ${grantAmount ? `<p style="margin: 4px 0;">💰 Upp till ${grantAmount}</p>` : ''}
                ${grantDeadline ? `<p style="margin: 4px 0;">📅 Deadline: ${grantDeadline}</p>` : ''}
              </div>
              <p>Du har bjudits in som <strong>${getRoleLabel(role)}</strong> och kan ${getRoleDescription(role)}.</p>
              <a href="${inviteUrl}" style="display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Öppna ansökan →</a>
              <p style="color: #666; font-size: 14px;">Länken är giltig i 7 dagar.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #999; font-size: 12px;">GetGrant.ai — AI-driven bidragsansökan för svenska företag</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error('Failed to send invite email:', emailErr);
      }

      res.json({
        inviteId: collaborator.id,
        email: collaborator.email,
        role: collaborator.role,
        status: collaborator.status,
        expiresAt: collaborator.inviteExpiresAt,
      });
    } catch (error) {
      console.error('Invite collaborator error:', error);
      res.status(500).json({ error: 'Failed to send invite' });
    }
  }
);

router.get(
  '/applications/:id/collaborators',
  isAuthenticated,
  requireApplicationAccess('viewer'),
  async (req, res) => {
    try {
      const applicationId = req.params.id as string;

      const collaborators = await db
        .select()
        .from(applicationCollaborators)
        .where(eq(applicationCollaborators.applicationId, applicationId))
        .orderBy(applicationCollaborators.createdAt);

      const application = (req as any).application;
      let ownerInfo = null;
      if (application?.companyId) {
        const [company] = await db
          .select()
          .from(companies)
          .where(eq(companies.id, application.companyId))
          .limit(1);
        if (company?.userId) {
          ownerInfo = {
            userId: company.userId,
            email: '',
            role: 'owner',
            status: 'accepted',
          };
        }
      }

      const result = collaborators.map((c, i) => ({
        id: c.id,
        userId: c.userId,
        email: c.email,
        role: c.role,
        status: c.status,
        joinedAt: c.joinedAt,
        createdAt: c.createdAt,
        color: getPresenceColor(i + 1),
      }));

      if (ownerInfo) {
        result.unshift({
          id: 'owner',
          userId: ownerInfo.userId,
          email: ownerInfo.email,
          role: 'owner',
          status: 'accepted',
          joinedAt: null,
          createdAt: null,
          color: getPresenceColor(0),
        });
      }

      res.json(result);
    } catch (error) {
      console.error('List collaborators error:', error);
      res.status(500).json({ error: 'Failed to list collaborators' });
    }
  }
);

router.put(
  '/applications/:id/collaborators/:collaboratorId/role',
  isAuthenticated,
  requireApplicationAccess('owner'),
  async (req, res) => {
    try {
      const collaboratorId = req.params.collaboratorId as string;
      const { role } = req.body;

      if (!['editor', 'commenter', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const [updated] = await db
        .update(applicationCollaborators)
        .set({ role })
        .where(eq(applicationCollaborators.id, collaboratorId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Collaborator not found' });
      }

      res.json(updated);
    } catch (error) {
      console.error('Update role error:', error);
      res.status(500).json({ error: 'Failed to update role' });
    }
  }
);

router.delete(
  '/applications/:id/collaborators/:collaboratorId',
  isAuthenticated,
  requireApplicationAccess('viewer'),
  async (req: any, res) => {
    try {
      const { collaboratorId } = req.params;
      const userId = req.user.claims.sub;
      const userRole = (req as any).applicationRole;

      const [collaborator] = await db
        .select()
        .from(applicationCollaborators)
        .where(eq(applicationCollaborators.id, collaboratorId))
        .limit(1);

      if (!collaborator) {
        return res.status(404).json({ error: 'Collaborator not found' });
      }

      const isSelfRemoval = collaborator.userId === userId;
      if (!isSelfRemoval && userRole !== 'owner') {
        return res.status(403).json({ error: 'Only the owner can remove collaborators' });
      }

      await db
        .delete(applicationCollaborators)
        .where(eq(applicationCollaborators.id, collaboratorId));

      res.json({ success: true });
    } catch (error) {
      console.error('Remove collaborator error:', error);
      res.status(500).json({ error: 'Failed to remove collaborator' });
    }
  }
);

router.get('/invites/:token/accept', isAuthenticated, async (req: any, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.claims.sub;
    const userEmail = req.user.claims.email || '';

    const [invite] = await db
      .select()
      .from(applicationCollaborators)
      .where(eq(applicationCollaborators.inviteToken, token))
      .limit(1);

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found or expired' });
    }

    if (invite.inviteExpiresAt && new Date(invite.inviteExpiresAt) < new Date()) {
      return res.status(410).json({ error: 'Invite has expired' });
    }

    if (invite.status === 'accepted') {
      return res.redirect(`/bidrag/${invite.applicationId}/apply`);
    }

    await db
      .update(applicationCollaborators)
      .set({
        userId,
        status: 'accepted',
        joinedAt: new Date(),
        email: userEmail || invite.email,
      })
      .where(eq(applicationCollaborators.id, invite.id));

    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, invite.applicationId))
      .limit(1);

    if (application?.grantId) {
      return res.redirect(`/bidrag/${application.grantId}/apply`);
    }

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

router.get('/invites/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const [invite] = await db
      .select()
      .from(applicationCollaborators)
      .where(eq(applicationCollaborators.inviteToken, token))
      .limit(1);

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (invite.inviteExpiresAt && new Date(invite.inviteExpiresAt) < new Date()) {
      return res.status(410).json({ error: 'Invite has expired' });
    }

    let grantTitle = '';
    let inviterEmail = '';

    if (invite.applicationId) {
      const [application] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, invite.applicationId))
        .limit(1);
      if (application?.grantId) {
        const [grant] = await db
          .select()
          .from(grants)
          .where(eq(grants.id, application.grantId))
          .limit(1);
        if (grant) grantTitle = grant.title;
      }
    }

    res.json({
      email: invite.email,
      role: invite.role,
      status: invite.status,
      grantTitle,
      expiresAt: invite.inviteExpiresAt,
    });
  } catch (error) {
    console.error('Get invite info error:', error);
    res.status(500).json({ error: 'Failed to get invite info' });
  }
});

// ==========================================
// COMMENTS
// ==========================================

router.get(
  '/applications/:id/comments',
  isAuthenticated,
  requireApplicationAccess('viewer'),
  async (req, res) => {
    try {
      const applicationId = req.params.id as string;
      const sectionKey = req.query.sectionKey as string | undefined;

      let conditions = [eq(applicationComments.applicationId, applicationId)];
      if (sectionKey) {
        conditions.push(eq(applicationComments.sectionKey, sectionKey));
      }

      const comments = await db
        .select()
        .from(applicationComments)
        .where(and(...conditions))
        .orderBy(applicationComments.createdAt);

      const topLevel = comments.filter(c => !c.parentId);
      const threaded = topLevel.map(parent => ({
        ...parent,
        replies: comments.filter(c => c.parentId === parent.id),
      }));

      res.json(threaded);
    } catch (error) {
      console.error('List comments error:', error);
      res.status(500).json({ error: 'Failed to list comments' });
    }
  }
);

router.post(
  '/applications/:id/comments',
  isAuthenticated,
  requireApplicationAccess('commenter'),
  async (req: any, res) => {
    try {
      const applicationId = req.params.id;
      const userId = req.user.claims.sub;
      const authorName = req.user.claims.first_name
        ? `${req.user.claims.first_name} ${req.user.claims.last_name || ''}`.trim()
        : req.user.claims.email || 'Unknown';
      const authorEmail = req.user.claims.email || '';
      const { sectionKey, content, parentId } = req.body;

      if (!content?.trim()) {
        return res.status(400).json({ error: 'Comment content required' });
      }

      const [comment] = await db
        .insert(applicationComments)
        .values({
          applicationId,
          sectionKey: sectionKey || null,
          userId,
          authorName,
          authorEmail,
          content: content.trim(),
          parentId: parentId || null,
        })
        .returning();

      res.json(comment);
    } catch (error) {
      console.error('Create comment error:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  }
);

router.put(
  '/applications/:id/comments/:commentId/resolve',
  isAuthenticated,
  requireApplicationAccess('editor'),
  async (req: any, res) => {
    try {
      const { commentId } = req.params;
      const userId = req.user.claims.sub;

      const [updated] = await db
        .update(applicationComments)
        .set({
          resolved: true,
          resolvedBy: userId,
          resolvedAt: new Date(),
        })
        .where(eq(applicationComments.id, commentId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      res.json(updated);
    } catch (error) {
      console.error('Resolve comment error:', error);
      res.status(500).json({ error: 'Failed to resolve comment' });
    }
  }
);

router.delete(
  '/applications/:id/comments/:commentId',
  isAuthenticated,
  requireApplicationAccess('commenter'),
  async (req: any, res) => {
    try {
      const { commentId } = req.params;
      const userId = req.user.claims.sub;

      const [comment] = await db
        .select()
        .from(applicationComments)
        .where(eq(applicationComments.id, commentId))
        .limit(1);

      if (!comment) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      if (comment.userId !== userId) {
        return res.status(403).json({ error: 'Can only delete your own comments' });
      }

      await db
        .delete(applicationComments)
        .where(eq(applicationComments.id, commentId));

      res.json({ success: true });
    } catch (error) {
      console.error('Delete comment error:', error);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  }
);

// ==========================================
// SECTION HISTORY
// ==========================================

router.get(
  '/applications/:id/sections/:sectionKey/history',
  isAuthenticated,
  requireApplicationAccess('viewer'),
  async (req, res) => {
    try {
      const applicationId = req.params.id as string;
      const sectionKey = req.params.sectionKey as string;

      const history = await db
        .select()
        .from(applicationSectionHistory)
        .where(
          and(
            eq(applicationSectionHistory.applicationId, applicationId),
            eq(applicationSectionHistory.sectionKey, sectionKey)
          )
        )
        .orderBy(desc(applicationSectionHistory.createdAt))
        .limit(20);

      res.json(history);
    } catch (error) {
      console.error('Get section history error:', error);
      res.status(500).json({ error: 'Failed to get section history' });
    }
  }
);

router.post(
  '/applications/:id/sections/:sectionKey/save',
  isAuthenticated,
  requireApplicationAccess('editor'),
  async (req: any, res) => {
    try {
      const { id: applicationId, sectionKey } = req.params;
      const userId = req.user.claims.sub;
      const editorName = req.user.claims.first_name
        ? `${req.user.claims.first_name} ${req.user.claims.last_name || ''}`.trim()
        : req.user.claims.email || 'Unknown';
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Content required' });
      }

      const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

      const [historyEntry] = await db
        .insert(applicationSectionHistory)
        .values({
          applicationId,
          sectionKey,
          content,
          editedBy: userId,
          editorName,
          wordCount,
        })
        .returning();

      res.json(historyEntry);
    } catch (error) {
      console.error('Save section history error:', error);
      res.status(500).json({ error: 'Failed to save section history' });
    }
  }
);

router.post(
  '/applications/:id/sections/:sectionKey/restore/:historyId',
  isAuthenticated,
  requireApplicationAccess('editor'),
  async (req: any, res) => {
    try {
      const { id: applicationId, sectionKey, historyId } = req.params;
      const userId = req.user.claims.sub;
      const editorName = req.user.claims.first_name
        ? `${req.user.claims.first_name} ${req.user.claims.last_name || ''}`.trim()
        : req.user.claims.email || 'Unknown';

      const [historyEntry] = await db
        .select()
        .from(applicationSectionHistory)
        .where(eq(applicationSectionHistory.id, historyId))
        .limit(1);

      if (!historyEntry) {
        return res.status(404).json({ error: 'History entry not found' });
      }

      const [application] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1);

      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }

      const currentSections = (application.sections as any[]) || [];
      const currentSection = currentSections.find(s => s.sectionKey === sectionKey);

      if (currentSection?.content) {
        await db.insert(applicationSectionHistory).values({
          applicationId,
          sectionKey,
          content: currentSection.content,
          editedBy: userId,
          editorName,
          wordCount: currentSection.content.trim().split(/\s+/).filter(Boolean).length,
        });
      }

      const updatedSections = currentSections.map(s =>
        s.sectionKey === sectionKey
          ? { ...s, content: historyEntry.content, wordCount: historyEntry.wordCount }
          : s
      );

      await db
        .update(applications)
        .set({
          sections: updatedSections as any,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, applicationId));

      res.json({ success: true, restoredContent: historyEntry.content });
    } catch (error) {
      console.error('Restore section error:', error);
      res.status(500).json({ error: 'Failed to restore section' });
    }
  }
);

// ==========================================
// PRESENCE (HTTP fallback)
// ==========================================

router.post(
  '/applications/:id/presence',
  isAuthenticated,
  requireApplicationAccess('viewer'),
  async (req: any, res) => {
    try {
      const applicationId = req.params.id;
      const userId = req.user.claims.sub;
      const userName = req.user.claims.first_name
        ? `${req.user.claims.first_name} ${req.user.claims.last_name || ''}`.trim()
        : req.user.claims.email || 'Unknown';
      const { currentSection } = req.body;

      const allCollabs = await db
        .select()
        .from(applicationCollaborators)
        .where(eq(applicationCollaborators.applicationId, applicationId));
      const colorIndex = allCollabs.findIndex(c => c.userId === userId);
      const userColor = getPresenceColor(colorIndex >= 0 ? colorIndex + 1 : 0);

      const existing = await db
        .select()
        .from(applicationPresence)
        .where(
          and(
            eq(applicationPresence.applicationId, applicationId),
            eq(applicationPresence.userId, userId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(applicationPresence)
          .set({
            currentSection: currentSection || null,
            lastSeenAt: new Date(),
            userName,
          })
          .where(eq(applicationPresence.id, existing[0].id));
      } else {
        await db.insert(applicationPresence).values({
          applicationId,
          userId,
          userName,
          userColor,
          currentSection: currentSection || null,
        });
      }

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const activeUsers = await db
        .select()
        .from(applicationPresence)
        .where(
          and(
            eq(applicationPresence.applicationId, applicationId),
          )
        );

      const filtered = activeUsers.filter(
        u => u.lastSeenAt && new Date(u.lastSeenAt) > fiveMinutesAgo
      );

      res.json(filtered);
    } catch (error) {
      console.error('Update presence error:', error);
      res.status(500).json({ error: 'Failed to update presence' });
    }
  }
);

router.delete(
  '/applications/:id/presence',
  isAuthenticated,
  async (req: any, res) => {
    try {
      const applicationId = req.params.id;
      const userId = req.user.claims.sub;

      await db
        .delete(applicationPresence)
        .where(
          and(
            eq(applicationPresence.applicationId, applicationId),
            eq(applicationPresence.userId, userId)
          )
        );

      res.json({ success: true });
    } catch (error) {
      console.error('Clear presence error:', error);
      res.status(500).json({ error: 'Failed to clear presence' });
    }
  }
);

router.get(
  '/applications/:id/presence',
  isAuthenticated,
  requireApplicationAccess('viewer'),
  async (req, res) => {
    try {
      const applicationId = req.params.id as string;
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const activeUsers = await db
        .select()
        .from(applicationPresence)
        .where(
          eq(applicationPresence.applicationId, applicationId)
        );

      const filtered = activeUsers.filter(
        u => u.lastSeenAt && new Date(u.lastSeenAt) > fiveMinutesAgo
      );

      res.json(filtered);
    } catch (error) {
      console.error('Get presence error:', error);
      res.status(500).json({ error: 'Failed to get presence' });
    }
  }
);

// ==========================================
// USER'S SHARED APPLICATIONS
// ==========================================

router.get('/user/shared-applications', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;

    const collaborations = await db
      .select()
      .from(applicationCollaborators)
      .where(
        and(
          eq(applicationCollaborators.userId, userId),
          eq(applicationCollaborators.status, 'accepted')
        )
      );

    const result = await Promise.all(
      collaborations.map(async (collab) => {
        const [application] = await db
          .select()
          .from(applications)
          .where(eq(applications.id, collab.applicationId))
          .limit(1);

        let grantTitle = '';
        if (application?.grantId) {
          const [grant] = await db
            .select()
            .from(grants)
            .where(eq(grants.id, application.grantId))
            .limit(1);
          if (grant) grantTitle = grant.title;
        }

        return {
          ...collab,
          application,
          grantTitle,
        };
      })
    );

    res.json(result.filter(r => r.application));
  } catch (error) {
    console.error('Get shared applications error:', error);
    res.status(500).json({ error: 'Failed to get shared applications' });
  }
});

export default router;
