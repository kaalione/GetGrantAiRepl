import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { db, pool } from "../db";
import { applicationCollaborators, applications, companies } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import cookie from "cookie";
import pgSession from "connect-pg-simple";
import session from "express-session";

interface PresenceUser {
  userId: string;
  userName: string;
  userColor: string;
  currentSection: string | null;
}

interface RoomUser {
  ws: WebSocket;
  userId: string;
  userName: string;
  userColor: string;
  currentSection: string | null;
}

const PRESENCE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
];

const rooms = new Map<string, Map<string, RoomUser>>();

function broadcastToRoom(applicationId: string, message: object, excludeWs?: WebSocket) {
  const room = rooms.get(applicationId);
  if (!room) return;

  const data = JSON.stringify(message);
  for (const [, user] of room) {
    if (user.ws !== excludeWs && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(data);
    }
  }
}

function getPresenceUsers(applicationId: string): PresenceUser[] {
  const room = rooms.get(applicationId);
  if (!room) return [];

  return Array.from(room.values()).map(u => ({
    userId: u.userId,
    userName: u.userName,
    userColor: u.userColor,
    currentSection: u.currentSection,
  }));
}

async function getUserIdFromSession(req: IncomingMessage): Promise<string | null> {
  try {
    const cookies = cookie.parse(req.headers.cookie || '');
    const sid = cookies['connect.sid'];
    if (!sid) return null;

    const unsignedSid = sid.startsWith('s:') ? sid.slice(2).split('.')[0] : sid;
    if (!unsignedSid) return null;

    const PgStore = pgSession(session);
    // Reuses the app pool so TLS settings (Supabase) apply here too.
    const store = new PgStore({
      pool,
      createTableIfMissing: false,
      tableName: "sessions",
    });

    return new Promise((resolve) => {
      store.get(unsignedSid, (err: any, sessionData: any) => {
        if (err || !sessionData) {
          resolve(null);
          return;
        }
        const userId = sessionData?.passport?.user?.claims?.sub;
        resolve(userId || null);
      });
    });
  } catch {
    return null;
  }
}

async function checkApplicationAccess(userId: string, applicationId: string): Promise<boolean> {
  try {
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!application) return false;

    if (application.companyId) {
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, application.companyId))
        .limit(1);

      if (company?.userId === userId) return true;
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

    return !!collaborator;
  } catch {
    return false;
  }
}

export function setupCollaborationWS(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/collaboration' });

  wss.on('connection', (ws, req) => {
    let applicationId: string | null = null;
    let userId: string | null = null;
    let authenticated = false;

    ws.on('message', async (data) => {
      try {
        const event = JSON.parse(data.toString());

        if (event.type === 'join') {
          applicationId = event.applicationId;

          if (!applicationId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Application ID required' }));
            ws.close();
            return;
          }

          const sessionUserId = await getUserIdFromSession(req);
          if (!sessionUserId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
            ws.close();
            return;
          }

          userId = sessionUserId;

          const hasAccess = await checkApplicationAccess(userId, applicationId);
          if (!hasAccess) {
            ws.send(JSON.stringify({ type: 'error', message: 'Access denied' }));
            ws.close();
            return;
          }

          authenticated = true;

          if (!rooms.has(applicationId)) {
            rooms.set(applicationId, new Map());
          }

          const room = rooms.get(applicationId)!;
          const colorIndex = room.size;

          room.set(userId, {
            ws,
            userId,
            userName: event.userName || 'Unknown',
            userColor: PRESENCE_COLORS[colorIndex % PRESENCE_COLORS.length],
            currentSection: null,
          });

          broadcastToRoom(applicationId, {
            type: 'presence_update',
            users: getPresenceUsers(applicationId),
          });
        }

        if (!authenticated) return;

        if (event.type === 'section_focus' && applicationId && userId) {
          const room = rooms.get(applicationId);
          const user = room?.get(userId);
          if (user) {
            user.currentSection = event.sectionKey || null;
          }

          broadcastToRoom(applicationId, {
            type: 'presence_update',
            users: getPresenceUsers(applicationId),
          }, ws);
        }

        if (event.type === 'section_updated' && applicationId) {
          broadcastToRoom(applicationId, {
            type: 'section_updated',
            sectionKey: event.sectionKey,
            editedBy: event.editedBy,
            editorName: event.editorName,
            updatedAt: new Date().toISOString(),
          }, ws);
        }

        if (event.type === 'comment_added' && applicationId) {
          broadcastToRoom(applicationId, {
            type: 'comment_added',
            comment: event.comment,
          }, ws);
        }

        if (event.type === 'leave' && applicationId && userId) {
          const room = rooms.get(applicationId);
          if (room) {
            room.delete(userId);
            if (room.size === 0) {
              rooms.delete(applicationId);
            } else {
              broadcastToRoom(applicationId, {
                type: 'presence_update',
                users: getPresenceUsers(applicationId),
              });
            }
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      if (applicationId && userId) {
        const room = rooms.get(applicationId);
        if (room) {
          room.delete(userId);
          if (room.size === 0) {
            rooms.delete(applicationId);
          } else {
            broadcastToRoom(applicationId, {
              type: 'presence_update',
              users: getPresenceUsers(applicationId),
            });
          }
        }
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });

  return wss;
}
