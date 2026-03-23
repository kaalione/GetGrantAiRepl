import rateLimit from "express-rate-limit";

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "För många förfrågningar. Försök igen om 15 minuter." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: "API-gräns nådd. Försök igen om 15 minuter." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

export const aiGenerationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 20,
  message: { error: "AI-genereringsgräns nådd. Max 20 genereringar per dag." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req: any) => req.user?.claims?.sub || req.ip || "anonymous",
});

export const semanticAnalysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { 
    error: "AI-analysgräns nådd",
    message: "Du har använt alla dina 10 AI-analyser för denna timme. Försök igen senare.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req: any) => req.user?.claims?.sub || req.ip || "anonymous",
});

export const cronLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Cron-gräns nådd. Försök igen om en minut." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});
