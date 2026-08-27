import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq } from "drizzle-orm";
import { grants, type Grant, type Company } from "../shared/schema";
import { calculateMatchScore, type RelevanceProfile } from "../client/src/lib/matching";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

interface TestCompanyProfile {
  companyName: string;
  industry: string;
  employees: number;
  revenue: number;
  foundedYear: number;
  location: string;
  focusAreas: string[];
  orgType: string;
}

interface TestCompany {
  id: string;
  label: string;
  market: string;
  profile: TestCompanyProfile;
  expectedInTop10: string[];
  expectedNotInTop10: string[];
  maxAcceptableScoreForExclusions: number;
  isNegativeControl?: boolean;
  negativeControlMaxHighScores?: number;
  negativeControlScoreThreshold?: number;
  marketSegmentationTest?: boolean;
  forbiddenMarkets?: string[];
}

interface GrantResult {
  rank: number;
  title: string;
  sourceName: string;
  score: number;
  isExpectedMatch: boolean;
  isExpectedExclusion: boolean;
  market?: string;
}

interface CheckResults {
  A: boolean | null;
  B: boolean | null;
  C: boolean | null;
  D: boolean | null;
  E: boolean | null;
}

interface TestResult {
  companyId: string;
  label: string;
  checks: CheckResults;
  top20Grants: GrantResult[];
  issues: string[];
}

interface TestReport {
  runAt: string;
  totalCompanies: number;
  passed: number;
  failed: number;
  criticalFailures: number;
  results: TestResult[];
}

const TEST_COMPANIES: TestCompany[] = [
  {
    id: 'C1', label: 'TechScale AB — AI SaaS startup Stockholm',
    market: 'SE',
    profile: {
      companyName: 'TechScale AB', industry: 'Tech/IT',
      employees: 8, revenue: 2100000, foundedYear: 2024,
      location: 'Stockholm', focusAreas: ['AI', 'Digitalization', 'SaaS'],
      orgType: 'Aktiebolag'
    },
    expectedInTop10: ['vinnova', 'tillvaxtverket', 'eic'],
    expectedNotInTop10: ['klimatklivet', 'jordbruksverket', 'kulturradet'],
    maxAcceptableScoreForExclusions: 40,
  },
  {
    id: 'C2', label: 'GreenBuild — Construction energy renovation Gothenburg',
    market: 'SE',
    profile: {
      companyName: 'GreenBuild Entreprenad AB', industry: 'Construction',
      employees: 45, revenue: 38000000, foundedYear: 2010,
      location: 'Göteborg', focusAreas: ['Sustainability', 'Energy', 'Construction'],
      orgType: 'Aktiebolag'
    },
    expectedInTop10: ['energimyndigheten', 'boverket', 'klimatklivet'],
    expectedNotInTop10: ['eic', 'kulturradet', 'jordbruksverket'],
    maxAcceptableScoreForExclusions: 35,
  },
  {
    id: 'C3', label: 'NordAqua — AgTech sensors Luleå Norrbotten',
    market: 'SE',
    profile: {
      companyName: 'NordAqua Fisketeknik AB', industry: 'Agriculture/AgTech',
      employees: 12, revenue: 6500000, foundedYear: 2019,
      location: 'Luleå', focusAreas: ['AgTech', 'Sustainability', 'Sensors', 'AI'],
      orgType: 'Aktiebolag'
    },
    expectedInTop10: ['jordbruksverket', 'vinnova', 'norrbotten', 'formas'],
    expectedNotInTop10: ['kulturradet', 'arvsfonden', 'trafikverket'],
    maxAcceptableScoreForExclusions: 35,
  },
  {
    id: 'C4', label: 'Medianova — MedTech digital health Malmö',
    market: 'SE',
    profile: {
      companyName: 'Medianova Health AB', industry: 'Health/MedTech',
      employees: 22, revenue: 14000000, foundedYear: 2021,
      location: 'Malmö', focusAreas: ['HealthTech', 'AI', 'MedTech'],
      orgType: 'Aktiebolag'
    },
    expectedInTop10: ['forte', 'ihi', 'vinnova', 'skane'],
    expectedNotInTop10: ['jordbruksverket', 'klimatklivet', 'boverket'],
    maxAcceptableScoreForExclusions: 35,
  },
  {
    id: 'C5', label: 'Kulturkompaniet — Creative film Östersund HB',
    market: 'SE',
    profile: {
      companyName: 'Kulturkompaniet i Östersund HB', industry: 'Culture/Creative',
      employees: 0, revenue: 850000, foundedYear: 2017,
      location: 'Östersund', focusAreas: ['Culture', 'Media', 'Creative'],
      orgType: 'Handelsbolag'
    },
    expectedInTop10: ['kulturradet', 'creative_europe', 'konstnarsnamnden'],
    expectedNotInTop10: ['eic', 'vinnova_innovation', 'energimyndigheten', 'klimatklivet'],
    maxAcceptableScoreForExclusions: 30,
  },
  {
    id: 'C6', label: 'ExportTech — Manufacturing export Västerås large SME',
    market: 'SE',
    profile: {
      companyName: 'ExportTech Solutions AB', industry: 'Manufacturing',
      employees: 67, revenue: 112000000, foundedYear: 2003,
      location: 'Västerås', focusAreas: ['Manufacturing', 'Export', 'Automation'],
      orgType: 'Aktiebolag'
    },
    expectedInTop10: ['ekn', 'vinnova_industri', 'tillvaxtverket'],
    expectedNotInTop10: ['eic_startup', 'arvsfonden', 'kulturradet'],
    maxAcceptableScoreForExclusions: 35,
  },
  {
    id: 'C7', label: 'Solkraft — Energy cooperative Dalarna ekonomisk förening',
    market: 'SE',
    profile: {
      companyName: 'Solkraft Kooperativ', industry: 'Energy',
      employees: 3, revenue: 4200000, foundedYear: 2020,
      location: 'Falun', focusAreas: ['Energy', 'Sustainability', 'Cleantech'],
      orgType: 'Ekonomisk förening'
    },
    expectedInTop10: ['energimyndigheten', 'klimatklivet', 'naturvardsverket'],
    expectedNotInTop10: ['eic', 'vinnova_deeptech', 'kulturradet'],
    maxAcceptableScoreForExclusions: 35,
  },
  {
    id: 'C8',
    label: 'NEGATIVE CONTROL — Law firm Stockholm no R&D',
    market: 'SE',
    isNegativeControl: true,
    profile: {
      companyName: 'Björk & Partners Advokatbyrå AB', industry: 'Professional Services',
      employees: 15, revenue: 18000000, foundedYear: 2008,
      location: 'Stockholm', focusAreas: ['Legal', 'IP'],
      orgType: 'Aktiebolag'
    },
    expectedInTop10: [],
    expectedNotInTop10: ['vinnova', 'eic', 'energimyndigheten', 'klimatklivet'],
    maxAcceptableScoreForExclusions: 30,
    negativeControlMaxHighScores: 3,
    negativeControlScoreThreshold: 60,
  },
  {
    id: 'C9', label: 'BioNord Pharma AS — Norwegian biotech Oslo',
    market: 'NO',
    profile: {
      companyName: 'BioNord Pharma AS', industry: 'Health/Life Science',
      employees: 34, revenue: 28000000, foundedYear: 2018,
      location: 'Oslo', focusAreas: ['LifeScience', 'BioTech', 'MedTech'],
      orgType: 'AS'
    },
    expectedInTop10: ['innovasjon_norge', 'forskningsradet', 'horizon'],
    expectedNotInTop10: ['vinnova', 'region_stockholm', 'lansstyrelse'],
    maxAcceptableScoreForExclusions: 25,
    marketSegmentationTest: true,
    forbiddenMarkets: ['SE'],
  },
  {
    id: 'C10', label: 'HelsinginTech Oy — Finnish quantum deeptech Helsinki',
    market: 'FI',
    profile: {
      companyName: 'HelsinginTech Oy', industry: 'Tech/IT',
      employees: 6, revenue: 1100000, foundedYear: 2022,
      location: 'Helsinki', focusAreas: ['AI', 'Quantum', 'DeepTech'],
      orgType: 'Oy'
    },
    expectedInTop10: ['business_finland', 'eic', 'horizon'],
    expectedNotInTop10: ['vinnova', 'energimyndigheten', 'region_skane', 'jordbruksverket'],
    maxAcceptableScoreForExclusions: 25,
    marketSegmentationTest: true,
    forbiddenMarkets: ['SE'],
  },
];

function buildCompanyObject(tc: TestCompany): Company {
  const description = `${tc.profile.companyName} is a ${tc.profile.industry} company based in ${tc.profile.location}, focused on ${tc.profile.focusAreas.join(', ')}. Founded in ${tc.profile.foundedYear} with ${tc.profile.employees} employees and revenue of ${tc.profile.revenue} SEK.`;

  return {
    id: `test-${tc.id.toLowerCase()}`,
    userId: null,
    companyName: tc.profile.companyName,
    orgNumber: null,
    orgType: tc.profile.orgType,
    industry: tc.profile.industry,
    employees: tc.profile.employees,
    revenue: String(tc.profile.revenue),
    foundedYear: tc.profile.foundedYear,
    description,
    location: tc.profile.location,
    websiteUrl: null,
    focusAreas: tc.profile.focusAreas,
    notificationEmail: null,
    notificationsEnabled: true,
    market: tc.market.toLowerCase(),
    createdAt: new Date(),
  } as Company;
}

function normalizeStr(str: string): string {
  return str
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function keywordInText(keyword: string, text: string): boolean {
  const normKeyword = normalizeStr(keyword);
  const normText = normalizeStr(text);
  if (normKeyword.length <= 3) {
    const words = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return words.some(w => w === normKeyword);
  }
  return normText.includes(normKeyword);
}

function runChecks(tc: TestCompany, top20: GrantResult[]): { checks: CheckResults; issues: string[] } {
  const issues: string[] = [];
  const top10 = top20.slice(0, 10);

  let checkA: boolean | null = null;
  if (tc.expectedInTop10.length > 0) {
    const threshold = Math.ceil(tc.expectedInTop10.length * 0.6);
    let foundCount = 0;
    const foundKeywords: string[] = [];
    const missingKeywords: string[] = [];
    for (const expected of tc.expectedInTop10) {
      const found = top10.some(g => keywordInText(expected, g.sourceName) || keywordInText(expected, g.title));
      if (found) {
        foundCount++;
        foundKeywords.push(expected);
      } else {
        missingKeywords.push(expected);
      }
    }
    checkA = foundCount >= threshold;
    if (!checkA) {
      issues.push(`Check A: Only ${foundCount}/${tc.expectedInTop10.length} expected sources in top 10 (need ${threshold}). Missing: ${missingKeywords.join(', ')}`);
    }
  } else if (tc.isNegativeControl) {
    checkA = true;
  }

  let checkB: boolean | null = null;
  const exclusionsFound: string[] = [];
  for (const grant of top10) {
    for (const excluded of tc.expectedNotInTop10) {
      if (keywordInText(excluded, grant.sourceName) || keywordInText(excluded, grant.title)) {
        exclusionsFound.push(`"${grant.sourceName}" matched exclusion "${excluded}" (rank ${grant.rank}, score ${grant.score})`);
      }
    }
  }
  checkB = exclusionsFound.length === 0;
  if (!checkB) {
    issues.push(`Check B: ${exclusionsFound.length} exclusion(s) in top 10: ${exclusionsFound.join('; ')}`);
  }

  let checkC: boolean | null = null;
  if (top10.length >= 10) {
    const score1 = top10[0].score;
    const score10 = top10[9].score;
    const spread = score1 - score10;
    const passScore = score1 >= 65;
    const passSpread = spread >= 25;
    checkC = passScore && passSpread;
    if (!checkC) {
      const reasons: string[] = [];
      if (!passScore) reasons.push(`top score ${score1} < 65`);
      if (!passSpread) reasons.push(`spread ${spread}pts < 25`);
      issues.push(`Check C: ${reasons.join(', ')}`);
    }
  } else {
    checkC = false;
    issues.push(`Check C: Fewer than 10 results returned`);
  }

  let checkD: boolean | null = null;
  if (tc.marketSegmentationTest && tc.forbiddenMarkets) {
    const violations = top20.filter(g =>
      g.market && tc.forbiddenMarkets!.some(fm => fm.toLowerCase() === g.market!.toLowerCase())
    );
    checkD = violations.length === 0;
    if (!checkD) {
      issues.push(`Check D: ${violations.length} grant(s) from forbidden market(s) in top 20: ${violations.map(v => `"${v.sourceName}" (market=${v.market}, rank ${v.rank})`).join('; ')}`);
    }
  }

  let checkE: boolean | null = null;
  if (tc.isNegativeControl && tc.negativeControlScoreThreshold != null && tc.negativeControlMaxHighScores != null) {
    const highScoreCount = top20.filter(g => g.score > tc.negativeControlScoreThreshold!).length;
    checkE = highScoreCount < tc.negativeControlMaxHighScores;
    if (!checkE) {
      issues.push(`Check E: ${highScoreCount} grants scored above ${tc.negativeControlScoreThreshold} (max allowed: ${tc.negativeControlMaxHighScores - 1})`);
    }
  }

  return {
    checks: { A: checkA, B: checkB, C: checkC, D: checkD, E: checkE },
    issues,
  };
}

function formatCheck(val: boolean | null): string {
  if (val === null) return 'n/a';
  return val ? '✅' : '❌';
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length);
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen - 1) + '…' : str;
}

async function main() {
  console.log('\n🔍 GetGrant.ai — Matching Quality Test Suite\n');
  console.log('='.repeat(60));

  const pool = new Pool({ connectionString: process.env.DATABASE_URL!.replace('sslmode=require', 'sslmode=no-verify') });
  const database = drizzle(pool);

  const allGrants = await database.select().from(grants);
  console.log(`Loaded ${allGrants.length} grants from database.\n`);

  const results: TestResult[] = [];

  for (const tc of TEST_COMPANIES) {
    const company = buildCompanyObject(tc);

    const marketGrants = allGrants.filter(g => {
      const grantMarket = (g.market || 'se').toLowerCase();
      const companyMarket = tc.market.toLowerCase();
      return grantMarket === companyMarket || !g.market;
    });

    const scored = marketGrants.map(g => {
      const match = calculateMatchScore(company, g as Grant);
      return {
        grant: g,
        score: match.score,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const top20 = scored.slice(0, 20);

    const top20Results: GrantResult[] = top20.map((item, idx) => ({
      rank: idx + 1,
      title: item.grant.title,
      sourceName: item.grant.sourceName,
      score: item.score,
      market: item.grant.market || 'se',
      isExpectedMatch: tc.expectedInTop10.some(k =>
        keywordInText(k, item.grant.sourceName) || keywordInText(k, item.grant.title)
      ),
      isExpectedExclusion: tc.expectedNotInTop10.some(k =>
        keywordInText(k, item.grant.sourceName) || keywordInText(k, item.grant.title)
      ),
    }));

    const { checks, issues } = runChecks(tc, top20Results);

    results.push({
      companyId: tc.id,
      label: tc.label,
      checks,
      top20Grants: top20Results,
      issues,
    });

    const boxWidth = 55;
    console.log('┌' + '─'.repeat(boxWidth) + '┐');
    console.log('│ ' + padRight(`${tc.id} — ${truncate(tc.label.split('—')[0].trim(), boxWidth - 8)}`, boxWidth - 1) + '│');
    console.log('│ ' + padRight(
      `Checks: A ${formatCheck(checks.A)}  B ${formatCheck(checks.B)}  C ${formatCheck(checks.C)}  D ${formatCheck(checks.D)}  E ${formatCheck(checks.E)}`,
      boxWidth - 1
    ) + '│');
    console.log('│ ' + padRight(`Market: ${tc.market} | ${marketGrants.length} grants evaluated`, boxWidth - 1) + '│');
    console.log('│ ' + padRight('Top 5 matches:', boxWidth - 1) + '│');

    for (let i = 0; i < Math.min(5, top20Results.length); i++) {
      const g = top20Results[i];
      const flag = g.isExpectedExclusion ? ' [⚠️ EXCLUSION]' : (g.isExpectedMatch ? ' [✓]' : '');
      const line = `  ${i + 1}. ${truncate(g.sourceName, 30)}  score: ${g.score}${flag}`;
      console.log('│ ' + padRight(line, boxWidth - 1) + '│');
    }

    if (issues.length > 0) {
      console.log('│ ' + padRight('Issues:', boxWidth - 1) + '│');
      for (const issue of issues) {
        const lines = wrapText(issue, boxWidth - 5);
        for (const line of lines) {
          console.log('│ ' + padRight(`  ${line}`, boxWidth - 1) + '│');
        }
      }
    }

    console.log('└' + '─'.repeat(boxWidth) + '┘');
    console.log('');
  }

  const passedResults = results.filter(r => {
    const checks = r.checks;
    return (checks.A === null || checks.A) &&
           (checks.B === null || checks.B) &&
           (checks.C === null || checks.C) &&
           (checks.D === null || checks.D) &&
           (checks.E === null || checks.E);
  });

  const failedResults = results.filter(r => !passedResults.includes(r));
  const criticalFailures = results.filter(r => r.checks.D === false).length;

  console.log('='.repeat(60));
  console.log(`Overall: ${passedResults.length}/${results.length} companies passed all checks.`);

  if (failedResults.length > 0) {
    const failedSummary = failedResults.map(r => {
      const failedChecks = Object.entries(r.checks)
        .filter(([, v]) => v === false)
        .map(([k]) => `Check ${k}`);
      return `${r.companyId} (${failedChecks.join(', ')})`;
    });
    console.log(`Failed companies: ${failedSummary.join(', ')}`);
  }

  console.log(`Critical failures: ${criticalFailures} (market segmentation)`);

  if (results.some(r => r.companyId === 'C8')) {
    const c8 = results.find(r => r.companyId === 'C8')!;
    const highScores = c8.top20Grants.filter(g => g.score > 60);
    if (highScores.length >= 3) {
      console.log(`\n⚠️  FINDING: C8 (law firm) has ${highScores.length} grants scoring >60.`);
      console.log('   This indicates a real matching quality issue — the engine is not');
      console.log('   sufficiently penalizing companies with no R&D/innovation focus.');
    }
  }

  console.log('');

  const report: TestReport = {
    runAt: new Date().toISOString(),
    totalCompanies: results.length,
    passed: passedResults.length,
    failed: failedResults.length,
    criticalFailures,
    results,
  };

  // fileURLToPath handles spaces in the repo path (URL pathname is %-encoded)
  const outputPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'matching-test-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`📄 JSON report saved to: ${outputPath}`);

  const profileOk = runProfileShiftTests(allGrants as Grant[]);

  await pool.end();
  process.exit(profileOk ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Search-profile relevance tests (spec E2): the same company must get
// different matches when a project profile carries the relevance data.
// Eligibility still reads from the company, so exclusions stay excluded.
// ---------------------------------------------------------------------------
interface ProfileShiftCase {
  id: string;
  label: string;
  company: TestCompany;
  profile: RelevanceProfile;
  // Sources that must appear in top 10 WITH the profile
  expectedInTop10WithProfile: string[];
  // Sources that must NOT be in top 10 in either mode
  neverInTop10: string[];
}

const PROFILE_SHIFT_CASES: ProfileShiftCase[] = [
  {
    id: 'P1',
    label: 'Konsultbolag + grönt energiprojekt → energibidrag',
    company: {
      id: 'P1', label: 'Rådgivarna Konsult AB', market: 'SE',
      profile: {
        companyName: 'Rådgivarna Konsult AB', industry: 'Professional Services',
        employees: 18, revenue: 21000000, foundedYear: 2012,
        location: 'Stockholm', focusAreas: ['Consulting', 'Management'],
        orgType: 'Aktiebolag',
      },
      expectedInTop10: [], expectedNotInTop10: [], maxAcceptableScoreForExclusions: 100,
    },
    profile: {
      kind: 'project',
      description: 'Utveckla en plattform för energilagring och solceller i kommersiella fastigheter med AI-styrd energioptimering',
      goals: 'Minska energianvändning och klimatutsläpp i fastighetsbeståndet',
      focusAreas: ['Energi', 'Cleantech'],
      keywords: ['energi', 'solceller', 'energilagring', 'klimat', 'hållbarhet'],
    },
    expectedInTop10WithProfile: ['energimyndigheten', 'klimatklivet', 'energi'],
    neverInTop10: ['kulturradet', 'konstnarsnamnden'],
  },
  {
    id: 'P2',
    label: 'Tech-startup + livsmedelsprojekt → jordbruk/livsmedel',
    company: {
      id: 'P2', label: 'TechScale AB', market: 'SE',
      profile: {
        companyName: 'TechScale AB', industry: 'Tech/IT',
        employees: 8, revenue: 2100000, foundedYear: 2024,
        location: 'Stockholm', focusAreas: ['AI', 'SaaS'],
        orgType: 'Aktiebolag',
      },
      expectedInTop10: [], expectedNotInTop10: [], maxAcceptableScoreForExclusions: 100,
    },
    profile: {
      kind: 'project',
      description: 'Spårbarhetsplattform för livsmedelskedjan från jordbruk till butik',
      goals: 'Minska matsvinn och öka livsmedelssäkerheten',
      focusAreas: ['Livsmedel', 'Jordbruk'],
      keywords: ['livsmedel', 'jordbruk', 'matsvinn', 'foodtech'],
    },
    expectedInTop10WithProfile: ['jordbruksverket', 'livsmedel', 'formas'],
    neverInTop10: ['kulturradet', 'konstnarsnamnden'],
  },
];

function topSources(company: Company, grantsToScore: Grant[], profile?: RelevanceProfile): { source: string; title: string; score: number }[] {
  return grantsToScore
    .map(g => ({ source: g.sourceName, title: g.title, score: calculateMatchScore(company, g, profile).score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function runProfileShiftTests(allGrants: Grant[]): boolean {
  console.log('\n🎯 Search-profile relevance tests\n' + '='.repeat(60));
  let allPassed = true;

  for (const tc of PROFILE_SHIFT_CASES) {
    const company = buildCompanyObject(tc.company);
    const marketGrants = allGrants.filter(g => (g.market || 'se').toLowerCase() === tc.company.market.toLowerCase() || !g.market);

    const withProfile = topSources(company, marketGrants, tc.profile);
    const withoutProfile = topSources(company, marketGrants);

    const hitText = (t: { source: string; title: string }) => `${t.source} ${t.title}`.toLowerCase();
    const inTop = (keyword: string, top: typeof withProfile) =>
      top.some(t => hitText(t).includes(keyword.replace(/_/g, ' ').toLowerCase()) || hitText(t).replace(/[^a-zåäö]/g, '').includes(keyword.replace(/_/g, '')));

    const expectedHits = tc.expectedInTop10WithProfile.filter(k => inTop(k, withProfile));
    const forbidden = tc.neverInTop10.filter(k => inTop(k, withProfile) || inTop(k, withoutProfile));
    const shifted = JSON.stringify(withProfile.map(t => t.title)) !== JSON.stringify(withoutProfile.map(t => t.title));

    const passed = expectedHits.length >= 2 && forbidden.length === 0 && shifted;
    allPassed = allPassed && passed;

    console.log(`\n${passed ? '✅' : '❌'} ${tc.id} — ${tc.label}`);
    console.log(`   Träffade förväntade källor med profil: ${expectedHits.length}/${tc.expectedInTop10WithProfile.length} (kräver ≥2)`);
    console.log(`   Topplistan ändrades av profilen: ${shifted ? 'ja' : 'NEJ'}`);
    if (forbidden.length > 0) console.log(`   ⚠️ Otillåtna källor i topp 10: ${forbidden.join(', ')}`);
    console.log('   Topp 5 med profil:');
    withProfile.slice(0, 5).forEach((t, i) => console.log(`     ${i + 1}. ${t.source} — ${t.title.slice(0, 50)} (${t.score})`));
    console.log('   Topp 5 utan profil (kärnverksamhet):');
    withoutProfile.slice(0, 5).forEach((t, i) => console.log(`     ${i + 1}. ${t.source} — ${t.title.slice(0, 50)} (${t.score})`));
  }

  console.log(`\n${allPassed ? '✅ Alla profiltester godkända' : '❌ Profiltester underkända'}`);
  return allPassed;
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

main().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
