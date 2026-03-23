import { type Request, type Response, type NextFunction } from 'express';
import { db } from '../db';
import { partnerApiKeys, partners } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

export async function validatePartnerApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer gg_pk_')) {
    return next();
  }

  const apiKey = authHeader.replace('Bearer ', '');
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const keyPrefix = apiKey.substring(0, 12);

  try {
    const [key] = await db.select().from(partnerApiKeys)
      .where(
        and(
          eq(partnerApiKeys.keyHash, keyHash),
          eq(partnerApiKeys.status, 'active')
        )
      );

    if (!key) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return res.status(401).json({ error: 'API key has expired' });
    }

    const [partner] = await db.select().from(partners)
      .where(eq(partners.id, key.partnerId));

    if (!partner || partner.status !== 'active') {
      return res.status(403).json({ error: 'Partner account is not active' });
    }

    if (!partner.allowApiAccess) {
      return res.status(403).json({ error: 'API access is not enabled for this plan' });
    }

    await db.update(partnerApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(partnerApiKeys.id, key.id));

    (req as any).partnerApiAuth = {
      partnerId: key.partnerId,
      keyId: key.id,
      scopes: key.scopes || ['read'],
    };

    next();
  } catch (error) {
    console.error('API key validation error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const apiAuth = (req as any).partnerApiAuth;
    if (!apiAuth) {
      return res.status(401).json({ error: 'API key required' });
    }
    if (!apiAuth.scopes.includes(scope) && !apiAuth.scopes.includes('admin')) {
      return res.status(403).json({ error: `Insufficient scope. Required: ${scope}` });
    }
    next();
  };
}
