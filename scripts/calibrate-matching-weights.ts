// Empirisk parametersökning för MATCHING_WEIGHTS i client/src/lib/matching.ts
// mot checkarna i scripts/test-matching-quality.ts. Kör med
//   SEARCH_ITER=300 npx tsx scripts/calibrate-matching-weights.ts
// (SEARCH_ITER=0 utvärderar bara nuvarande vikter.)
// Hårda krav: alla B, D, E och profiltesterna P1/P2 måste passera.
// Maximera: antal A-pass + C-pass (top>=65, spread rank1->rank100 >=10,
// >=3 distinkta källor i topp 10; negativkontrollen undantas från C).
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { grants, type Grant, type Company } from "../shared/schema";
import { calculateMatchScore, MATCHING_WEIGHTS, type RelevanceProfile } from "@shared/matching";

const { Pool } = pg;

interface TC {
  id: string; market: string;
  company: Company;
  expectedInTop10: string[]; expectedNotInTop10: string[];
  isNegativeControl?: boolean;
  negMax?: number; negThreshold?: number;
  forbiddenMarkets?: string[];
}

function mk(id: string, market: string, p: {
  companyName: string; industry: string; employees: number; revenue: number;
  foundedYear: number; location: string; focusAreas: string[]; orgType: string;
}): Company {
  const description = `${p.companyName} is a ${p.industry} company based in ${p.location}, focused on ${p.focusAreas.join(', ')}. Founded in ${p.foundedYear} with ${p.employees} employees and revenue of ${p.revenue} SEK.`;
  return {
    id: `test-${id}`, userId: null, companyName: p.companyName, orgNumber: null,
    orgType: p.orgType, industry: p.industry, employees: p.employees,
    revenue: String(p.revenue), foundedYear: p.foundedYear, description,
    location: p.location, websiteUrl: null, focusAreas: p.focusAreas,
    notificationEmail: null, notificationsEnabled: true, market: market.toLowerCase(),
    createdAt: new Date(),
  } as Company;
}

const CASES: TC[] = [
  { id: 'C1', market: 'SE', company: mk('c1', 'se', { companyName: 'TechScale AB', industry: 'Tech/IT', employees: 8, revenue: 2100000, foundedYear: 2024, location: 'Stockholm', focusAreas: ['AI', 'Digitalization', 'SaaS'], orgType: 'Aktiebolag' }), expectedInTop10: ['vinnova', 'tillvaxtverket', 'eic'], expectedNotInTop10: ['klimatklivet', 'jordbruksverket', 'kulturradet'] },
  { id: 'C2', market: 'SE', company: mk('c2', 'se', { companyName: 'GreenBuild Entreprenad AB', industry: 'Construction', employees: 45, revenue: 38000000, foundedYear: 2010, location: 'Göteborg', focusAreas: ['Sustainability', 'Energy', 'Construction'], orgType: 'Aktiebolag' }), expectedInTop10: ['energimyndigheten', 'boverket', 'klimatklivet'], expectedNotInTop10: ['eic', 'kulturradet', 'jordbruksverket'] },
  { id: 'C3', market: 'SE', company: mk('c3', 'se', { companyName: 'NordAqua Fisketeknik AB', industry: 'Agriculture/AgTech', employees: 12, revenue: 6500000, foundedYear: 2019, location: 'Luleå', focusAreas: ['AgTech', 'Sustainability', 'Sensors', 'AI'], orgType: 'Aktiebolag' }), expectedInTop10: ['jordbruksverket', 'vinnova', 'norrbotten', 'formas'], expectedNotInTop10: ['kulturradet', 'arvsfonden', 'trafikverket'] },
  { id: 'C4', market: 'SE', company: mk('c4', 'se', { companyName: 'Medianova Health AB', industry: 'Health/MedTech', employees: 22, revenue: 14000000, foundedYear: 2021, location: 'Malmö', focusAreas: ['HealthTech', 'AI', 'MedTech'], orgType: 'Aktiebolag' }), expectedInTop10: ['forte', 'ihi', 'vinnova', 'skane'], expectedNotInTop10: ['jordbruksverket', 'klimatklivet', 'boverket'] },
  { id: 'C5', market: 'SE', company: mk('c5', 'se', { companyName: 'Kulturkompaniet i Östersund HB', industry: 'Culture/Creative', employees: 0, revenue: 850000, foundedYear: 2017, location: 'Östersund', focusAreas: ['Culture', 'Media', 'Creative'], orgType: 'Handelsbolag' }), expectedInTop10: ['kulturradet', 'creative_europe', 'konstnarsnamnden'], expectedNotInTop10: ['eic', 'vinnova_innovation', 'energimyndigheten', 'klimatklivet'] },
  { id: 'C6', market: 'SE', company: mk('c6', 'se', { companyName: 'ExportTech Solutions AB', industry: 'Manufacturing', employees: 67, revenue: 112000000, foundedYear: 2003, location: 'Västerås', focusAreas: ['Manufacturing', 'Export', 'Automation'], orgType: 'Aktiebolag' }), expectedInTop10: ['ekn', 'vinnova_industri', 'tillvaxtverket'], expectedNotInTop10: ['eic_startup', 'arvsfonden', 'kulturradet'] },
  { id: 'C7', market: 'SE', company: mk('c7', 'se', { companyName: 'Solkraft Kooperativ', industry: 'Energy', employees: 3, revenue: 4200000, foundedYear: 2020, location: 'Falun', focusAreas: ['Energy', 'Sustainability', 'Cleantech'], orgType: 'Ekonomisk förening' }), expectedInTop10: ['energimyndigheten', 'klimatklivet', 'naturvardsverket'], expectedNotInTop10: ['eic', 'vinnova_deeptech', 'kulturradet'] },
  { id: 'C8', market: 'SE', isNegativeControl: true, negMax: 3, negThreshold: 60, company: mk('c8', 'se', { companyName: 'Björk & Partners Advokatbyrå AB', industry: 'Professional Services', employees: 15, revenue: 18000000, foundedYear: 2008, location: 'Stockholm', focusAreas: ['Legal', 'IP'], orgType: 'Aktiebolag' }), expectedInTop10: [], expectedNotInTop10: ['vinnova', 'eic', 'energimyndigheten', 'klimatklivet'] },
  { id: 'C9', market: 'NO', forbiddenMarkets: ['SE'], company: mk('c9', 'no', { companyName: 'BioNord Pharma AS', industry: 'Health/Life Science', employees: 34, revenue: 28000000, foundedYear: 2018, location: 'Oslo', focusAreas: ['LifeScience', 'BioTech', 'MedTech'], orgType: 'AS' }), expectedInTop10: ['innovasjon_norge', 'forskningsradet', 'horizon'], expectedNotInTop10: ['vinnova', 'region_stockholm', 'lansstyrelse'] },
  { id: 'C10', market: 'FI', forbiddenMarkets: ['SE'], company: mk('c10', 'fi', { companyName: 'HelsinginTech Oy', industry: 'Tech/IT', employees: 6, revenue: 1100000, foundedYear: 2022, location: 'Helsinki', focusAreas: ['AI', 'Quantum', 'DeepTech'], orgType: 'Oy' }), expectedInTop10: ['business_finland', 'eic', 'horizon'], expectedNotInTop10: ['vinnova', 'energimyndigheten', 'region_skane', 'jordbruksverket'] },
];

const P_CASES: { company: Company; profile: RelevanceProfile; expected: string[]; never: string[] }[] = [
  {
    company: mk('p1', 'se', { companyName: 'Rådgivarna Konsult AB', industry: 'Professional Services', employees: 18, revenue: 21000000, foundedYear: 2012, location: 'Stockholm', focusAreas: ['Consulting', 'Management'], orgType: 'Aktiebolag' }),
    profile: { kind: 'project', description: 'Utveckla en plattform för energilagring och solceller i kommersiella fastigheter med AI-styrd energioptimering', goals: 'Minska energianvändning och klimatutsläpp i fastighetsbeståndet', focusAreas: ['Energi', 'Cleantech'], keywords: ['energi', 'solceller', 'energilagring', 'klimat', 'hållbarhet'] },
    expected: ['energimyndigheten', 'klimatklivet', 'energi'], never: ['kulturradet', 'konstnarsnamnden'],
  },
  {
    company: mk('p2', 'se', { companyName: 'TechScale AB', industry: 'Tech/IT', employees: 8, revenue: 2100000, foundedYear: 2024, location: 'Stockholm', focusAreas: ['AI', 'SaaS'], orgType: 'Aktiebolag' }),
    profile: { kind: 'project', description: 'Spårbarhetsplattform för livsmedelskedjan från jordbruk till butik', goals: 'Minska matsvinn och öka livsmedelssäkerheten', focusAreas: ['Livsmedel', 'Jordbruk'], keywords: ['livsmedel', 'jordbruk', 'matsvinn', 'foodtech'] },
    expected: ['jordbruksverket', 'livsmedel', 'formas'], never: ['kulturradet', 'konstnarsnamnden'],
  },
];

function normalizeStr(str: string): string {
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function keywordInText(keyword: string, text: string): boolean {
  const normKeyword = normalizeStr(keyword);
  if (normKeyword.length <= 3) {
    const words = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return words.some(w => w === normKeyword);
  }
  return normalizeStr(text).includes(normKeyword);
}

interface EvalResult {
  hardOk: boolean;
  aPass: string[]; aFail: string[];
  cPass: string[]; cTopPass: string[];
  bFail: string[]; eFail: string[]; pFail: string[];
  objective: number;
}

function evaluate(allGrants: Grant[]): EvalResult {
  const aPass: string[] = [], aFail: string[] = [], cPass: string[] = [], cTopPass: string[] = [];
  const bFail: string[] = [], eFail: string[] = [], pFail: string[] = [];
  let margin = 0;

  for (const tc of CASES) {
    const pool = allGrants.filter(g => {
      const gm = (g.market || 'se').toLowerCase();
      // 'eu' = EU-omfattande program, synligt i alla marknader (som i sviten)
      return gm === tc.market.toLowerCase() || gm === 'eu' || !g.market;
    });
    const scored = pool.map(g => ({ g, score: calculateMatchScore(tc.company, g).score }));
    scored.sort((a, b) => b.score - a.score);
    const top10 = scored.slice(0, 10);
    const top20 = scored.slice(0, 20);
    const inText = (kw: string, s: { g: Grant }) => keywordInText(kw, s.g.sourceName || '') || keywordInText(kw, s.g.title || '');

    // A
    if (tc.expectedInTop10.length > 0) {
      const threshold = Math.ceil(tc.expectedInTop10.length * 0.6);
      const found = tc.expectedInTop10.filter(kw => top10.some(s => inText(kw, s))).length;
      if (found >= threshold) aPass.push(tc.id); else aFail.push(`${tc.id}(${found}/${tc.expectedInTop10.length})`);
      margin += Math.min(found, threshold) / threshold;
    }
    // B
    for (const ex of tc.expectedNotInTop10) {
      if (top10.some(s => inText(ex, s))) bFail.push(`${tc.id}:${ex}`);
    }
    // C — speglar svitens omdesignade Check C: topp >=65, spread >=10 mellan
    // rank 1 och rank 100, minst 3 distinkta källor i topp 10. C8 undantas.
    if (!tc.isNegativeControl) {
      const deep = scored[Math.min(99, scored.length - 1)].score;
      const spread = top10[0].score - deep;
      const distinctSources = new Set(top10.map(s => s.g.sourceName)).size;
      const topOk = top10[0].score >= 65;
      if (topOk) cTopPass.push(tc.id);
      if (topOk && spread >= 10 && distinctSources >= 3) cPass.push(tc.id);
      margin += Math.min(top10[0].score, 65) / 65 * 0.5
        + Math.min(spread, 10) / 10 * 0.25
        + Math.min(distinctSources, 3) / 3 * 0.25;
    }
    // D
    if (tc.forbiddenMarkets) {
      for (const s of top20) {
        const gm = (s.g.market || 'se').toUpperCase();
        if (tc.forbiddenMarkets.includes(gm)) bFail.push(`${tc.id}:marketD`);
      }
    }
    // E
    if (tc.isNegativeControl) {
      const high = top20.filter(s => s.score > tc.negThreshold!).length;
      if (high >= tc.negMax!) eFail.push(`${tc.id}:${high}>60`);
    }
  }

  // Profile shift tests
  const sePool = allGrants.filter(g => ['se', 'eu'].includes((g.market || 'se').toLowerCase()) || !g.market);
  for (const pc of P_CASES) {
    const withP = sePool.map(g => ({ g, score: calculateMatchScore(pc.company, g, pc.profile).score }))
      .sort((a, b) => b.score - a.score).slice(0, 10);
    const withoutP = sePool.map(g => ({ g, score: calculateMatchScore(pc.company, g).score }))
      .sort((a, b) => b.score - a.score).slice(0, 10);
    const hitText = (t: { g: Grant }) => `${t.g.sourceName} ${t.g.title}`.toLowerCase();
    const inTop = (kw: string, top: typeof withP) =>
      top.some(t => hitText(t).includes(kw.replace(/_/g, ' ').toLowerCase()) || hitText(t).replace(/[^a-zåäö]/g, '').includes(kw.replace(/_/g, '')));
    const hits = pc.expected.filter(k => inTop(k, withP)).length;
    const forbidden = pc.never.filter(k => inTop(k, withP) || inTop(k, withoutP)).length;
    const shifted = JSON.stringify(withP.map(t => t.g.title)) !== JSON.stringify(withoutP.map(t => t.g.title));
    if (!(hits >= 2 && forbidden === 0 && shifted)) pFail.push(`${pc.company.companyName}(${hits},f${forbidden},${shifted})`);
  }

  const hardOk = bFail.length === 0 && eFail.length === 0 && pFail.length === 0;
  const objective = (hardOk ? 0 : -1000 - 50 * (bFail.length + eFail.length + pFail.length))
    + aPass.length * 10 + cPass.length * 10 + cTopPass.length * 2 + margin;

  return { hardOk, aPass, aFail, cPass, cTopPass, bFail, eFail, pFail, objective };
}

// Sökbara parametrar med intervall [min, max, steg]
const PARAM_SPACE: Record<string, [number, number, number]> = {
  industryMax: [26, 44, 2],
  industryFloor: [0.4, 0.8, 0.05],
  industryNeutral: [5, 9, 1],
  sectorPenalty: [-25, -10, 5],
  sizeTargetGroupMatch: [9, 17, 2],
  sizeNeutral: [2, 8, 1],
  sizeMismatch: [2, 4, 1],
  revenueNeutral: [2, 4, 1],
  regionNational: [9, 18, 3],
  regionInternational: [0, 10, 2],
  regionNeutral: [3, 6, 1],
  keywordMax: [24, 44, 4],
  keywordWeightLong: [8, 18, 2],
  keywordWeightMid: [4, 9, 1],
  keywordWeightShort: [1, 4, 1],
  keywordTitleCap: [2, 4, 1],
  keywordNeutral: [2, 8, 1],
  noDataScore: [20, 30, 5],
};

function randStep(v: [number, number, number]): number {
  const [min, max, step] = v;
  const n = Math.round((max - min) / step);
  const val = min + step * Math.floor(Math.random() * (n + 1));
  return Math.round(val * 100) / 100;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL!.replace('sslmode=require', 'sslmode=no-verify') });
  const db = drizzle(pool);
  const allGrants = (await db.select().from(grants)) as Grant[];
  await pool.end();
  console.log(`Loaded ${allGrants.length} grants.`);

  const W = MATCHING_WEIGHTS as unknown as Record<string, number>;
  const baseline = evaluate(allGrants);
  console.log(`Baseline: obj=${baseline.objective.toFixed(1)} A=[${baseline.aPass}] C=[${baseline.cPass}] Ctop=[${baseline.cTopPass}] hard=${baseline.hardOk} B=[${baseline.bFail}] E=[${baseline.eFail}] P=[${baseline.pFail}]`);

  let best = { ...W };
  let bestResult = baseline;

  const ITER = Number(process.env.SEARCH_ITER || 250);
  const t0 = Date.now();
  for (let i = 0; i < ITER; i++) {
    // utgå från bästa, muttera 1-3 parametrar (20% chans: helt slumpad punkt)
    const candidate = { ...best };
    if (Math.random() < 0.2) {
      for (const k of Object.keys(PARAM_SPACE)) candidate[k] = randStep(PARAM_SPACE[k]);
    } else {
      const keys = Object.keys(PARAM_SPACE);
      const nMut = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < nMut; j++) {
        const k = keys[Math.floor(Math.random() * keys.length)];
        candidate[k] = randStep(PARAM_SPACE[k]);
      }
    }
    Object.assign(W, candidate);
    const r = evaluate(allGrants);
    if (r.objective > bestResult.objective) {
      best = { ...candidate };
      bestResult = r;
      console.log(`[${i}] obj=${r.objective.toFixed(1)} A=[${r.aPass}] C=[${r.cPass}] Ctop=[${r.cTopPass}] hard=${r.hardOk}`);
    }
  }
  // Girig koordinatpolering: prova varje stegvärde per parameter tills
  // ingen enskild ändring förbättrar målet längre (max 3 svep).
  for (let sweep = 0; sweep < 3; sweep++) {
    let improved = false;
    for (const k of Object.keys(PARAM_SPACE)) {
      const [min, max, step] = PARAM_SPACE[k];
      for (let v = min; v <= max + 1e-9; v += step) {
        const val = Math.round(v * 100) / 100;
        if (val === best[k]) continue;
        const candidate = { ...best, [k]: val };
        Object.assign(W, candidate);
        const r = evaluate(allGrants);
        if (r.objective > bestResult.objective) {
          best = candidate;
          bestResult = r;
          improved = true;
          console.log(`[polish ${k}=${val}] obj=${r.objective.toFixed(1)} A=[${r.aPass}] C=[${r.cPass}]`);
        }
      }
    }
    if (!improved) break;
  }

  Object.assign(W, best);
  const final = evaluate(allGrants);
  console.log(`\n${ITER} iterationer på ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`\nBästa konfiguration (obj=${final.objective.toFixed(1)}):`);
  console.log(JSON.stringify(best, null, 2));
  console.log(`A pass: ${final.aPass.join(', ')} | A fail: ${final.aFail.join(', ')}`);
  console.log(`C pass: ${final.cPass.join(', ')} | C top>=65: ${final.cTopPass.join(', ')}`);
  console.log(`Hårda krav OK: ${final.hardOk} B=[${final.bFail}] E=[${final.eFail}] P=[${final.pFail}]`);
}

main();
