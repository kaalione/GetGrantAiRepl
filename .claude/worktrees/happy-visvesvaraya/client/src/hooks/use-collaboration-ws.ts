import { useState, useEffect, useRef, useCallback } from "react";

interface PresenceUser {
  userId: string;
  userName: string;
  userColor: string;
  currentSection: string | null;
}

interface WSMessage {
  type: string;
  users?: PresenceUser[];
  sectionKey?: string;
  editedBy?: string;
  editorName?: string;
  updatedAt?: string;
  comment?: any;
}

export function useCollaborationWS(applicationId: string | null, userId: string | null, userName: string | null) {
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [sectionUpdates, setSectionUpdates] = useState<Record<string, { editedBy: string; editorName: string; updatedAt: string }>>({});
  const [newComments, setNewComments] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!applicationId || !userId || !userName) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/collaboration`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join',
        applicationId,
        userId,
        userName,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        if (message.type === 'presence_update' && message.users) {
          setPresenceUsers(message.users.filter(u => u.userId !== userId));
        }

        if (message.type === 'section_updated' && message.sectionKey) {
          setSectionUpdates(prev => ({
            ...prev,
            [message.sectionKey!]: {
              editedBy: message.editedBy || '',
              editorName: message.editorName || '',
              updatedAt: message.updatedAt || new Date().toISOString(),
            },
          }));
        }

        if (message.type === 'comment_added' && message.comment) {
          setNewComments(prev => [...prev, message.comment]);
        }
      } catch (err) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [applicationId, userId, userName]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const updateSectionFocus = useCallback((sectionKey: string | null) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'section_focus',
        sectionKey,
      }));
    }
  }, []);

  const notifySectionUpdate = useCallback((sectionKey: string, editorName: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'section_updated',
        sectionKey,
        editedBy: userId,
        editorName,
      }));
    }
  }, [userId]);

  const notifyCommentAdded = useCallback((comment: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'comment_added',
        comment,
      }));
    }
  }, []);

  const clearNewComments = useCallback(() => {
    setNewComments([]);
  }, []);

  return {
    presenceUsers,
    sectionUpdates,
    newComments,
    updateSectionFocus,
    notifySectionUpdate,
    notifyCommentAdded,
    clearNewComments,
  };
}
