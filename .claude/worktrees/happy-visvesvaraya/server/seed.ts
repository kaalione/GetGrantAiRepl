import { db } from "./db";
import { grants, scraperSources, scraperLogs } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  // Check if grants already exist
  const existingGrants = await db.select().from(grants).limit(1);
  if (existingGrants.length > 0) {
    console.log("Database already seeded, skipping...");
    return;
  }

  console.log("Seeding database with sample data...");

  // Seed grants with realistic Swedish grants
  const seedGrants = [
    {
      title: "Innovationsprojekt inom Grön Teknik",
      description: "Vinnova utlyser medel för innovationsprojekt som utvecklar nya lösningar för att accelerera den gröna omställningen. Projekten ska bidra till att lösa samhällsutmaningar kopplade till klimat och miljö genom innovativa tekniska lösningar. Vi välkomnar ansökningar från företag som vill utveckla banbrytande teknologier inom förnybar energi, cirkulär ekonomi eller hållbar produktion.",
      sourceName: "Vinnova",
      sourceType: "myndighet",
      url: "https://www.vinnova.se/e/gron-teknik-2024",
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      amountMin: "500000",
      amountMax: "5000000",
      eligibilityCriteria: {
        "Företagsform": "Aktiebolag eller handelsbolag",
        "Storlek": "SME (mindre än 250 anställda)",
        "Etablering": "Registrerat i Sverige"
      },
      targetGroup: ["startup", "sme"],
      keywords: ["grön teknik", "innovation", "hållbarhet", "miljö", "klimat"],
      applicationRequirements: {
        "Projektbeskrivning": "Max 10 sidor",
        "Budget": "Detaljerad kostnadsplan",
        "Team": "CV för nyckelpersoner"
      },
      status: "open",
    },
    {
      title: "Tillväxtlån för Expansion",
      description: "Tillväxtverket erbjuder lån till företag som vill växa och expandera sin verksamhet. Lånet kan användas till investeringar i maskiner, lokaler, eller för att anställa ny personal. Särskilt fokus på företag i glesbygd och företag som bidrar till regional utveckling.",
      sourceName: "Tillväxtverket",
      sourceType: "myndighet",
      url: "https://tillvaxtverket.se/finansiering/tillvaxtlan",
      deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
      amountMin: "100000",
      amountMax: "2000000",
      eligibilityCriteria: {
        "Omsättning": "Minst 1 miljoner SEK",
        "Anställda": "Minst 3 heltidsanställda",
        "Resultat": "Positivt rörelseresultat senaste året"
      },
      targetGroup: ["sme"],
      keywords: ["tillväxt", "expansion", "lån", "investering"],
      applicationRequirements: {
        "Affärsplan": "Tillväxtstrategi för kommande 3 år",
        "Finansiella rapporter": "Årsredovisning senaste 2 år"
      },
      status: "open",
    },
    {
      title: "EU Horizon Europe - Digital Innovation",
      description: "EU:s ramprogram Horizon Europe utlyser medel för digitala innovationsprojekt. Fokus ligger på AI, cybersäkerhet och digital transformation av europeiska företag och samhället. Projekten ska bidra till EU:s digitala agenda och stärka Europas konkurrenskraft inom digital teknik.",
      sourceName: "EU Horizon Europe",
      sourceType: "eu",
      url: "https://ec.europa.eu/info/horizon-europe",
      deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days from now
      amountMin: "1000000",
      amountMax: "10000000",
      eligibilityCriteria: {
        "Konsortium": "Minst 3 partners från olika EU-länder",
        "TRL": "Technology Readiness Level 4-6",
        "Innovationshöjd": "Betydande tekniskt genombrott"
      },
      targetGroup: ["startup", "sme"],
      keywords: ["AI", "digital", "cybersäkerhet", "EU", "innovation"],
      applicationRequirements: {
        "Proposal": "Full proposal enligt EU-mall",
        "Consortium agreement": "Undertecknat av alla partners",
        "Ethics": "Etisk bedömning om tillämpligt"
      },
      status: "open",
    },
    {
      title: "Stiftelsen för Strategisk Forskning - Industridoktorander",
      description: "SSF finansierar industridoktorandprogram där företag och universitet samarbetar för att lösa industriella forskningsfrågor. Doktoranden anställs på företaget och bedriver forskning i samarbete med akademin. Fokus på strategiska forskningsområden som materialvetenskap, bioteknik och IT.",
      sourceName: "Stiftelsen för Strategisk Forskning",
      sourceType: "stiftelse",
      url: "https://strategiska.se/utlysningar/industridoktorand",
      deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
      amountMin: "2000000",
      amountMax: "4000000",
      eligibilityCriteria: {
        "Akademisk partner": "Svenskt universitet eller högskola",
        "Forskningsområde": "Strategiska forskningsområden",
        "Anställning": "Doktoranden ska anställas på företaget"
      },
      targetGroup: ["sme"],
      keywords: ["forskning", "doktorand", "industri", "akademi", "samarbete"],
      applicationRequirements: {
        "Forskningsplan": "Detaljerad plan för doktorandprojektet",
        "Handledare": "CV för handledare från företag och akademi",
        "Samarbetsavtal": "Letter of Intent från alla parter"
      },
      status: "upcoming",
    },
    {
      title: "Almi Innovationslån",
      description: "Almi erbjuder lån till innovativa företag som behöver finansiering för att utveckla och kommersialisera nya produkter eller tjänster. Lånet är speciellt anpassat för företag med hög tillväxtpotential men begränsade säkerheter. Vi finansierar både produktutveckling och marknadsintroduktion.",
      sourceName: "Almi",
      sourceType: "myndighet",
      url: "https://www.almi.se/vara-tjanster/lan/innovationslan",
      deadline: null, // Rolling applications
      amountMin: "200000",
      amountMax: "3000000",
      eligibilityCriteria: {
        "Innovation": "Ny produkt, tjänst eller affärsmodell",
        "Marknadspotential": "Tydlig kommersiell potential",
        "Team": "Kompetent team för genomförande"
      },
      targetGroup: ["startup", "sme"],
      keywords: ["lån", "innovation", "kommersialisering", "tillväxt"],
      applicationRequirements: {
        "Affärsplan": "Inkl. marknadsanalys och finansplan",
        "Pitch": "Personlig presentation"
      },
      status: "open",
    },
    {
      title: "Klimatklivet - Lokala Klimatinvesteringar",
      description: "Naturvårdsverket delar ut stöd till lokala klimatinvesteringar som ger störst klimatnytta per investerad krona. Stödet riktar sig till kommuner, regioner, företag och organisationer som vill investera i konkreta åtgärder för att minska utsläpp av växthusgaser.",
      sourceName: "Naturvårdsverket",
      sourceType: "myndighet",
      url: "https://www.naturvardsverket.se/klimatklivet",
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now - urgent!
      amountMin: "100000",
      amountMax: "50000000",
      eligibilityCriteria: {
        "Klimateffekt": "Dokumenterad utsläppsminskning",
        "Additionalitet": "Investeringen hade inte skett utan stöd",
        "Genomförbarhet": "Realistisk tidsplan och budget"
      },
      targetGroup: ["sme", "nonprofit"],
      keywords: ["klimat", "utsläpp", "investering", "miljö", "hållbarhet"],
      applicationRequirements: {
        "Klimatkalkyl": "Beräkning av utsläppsminskning",
        "Projektplan": "Detaljerad genomförandeplan",
        "Budget": "Specificerad kostnadskalkyl"
      },
      status: "open",
    },
  ];

  await db.insert(grants).values(seedGrants);
  console.log(`Inserted ${seedGrants.length} grants`);

  // Seed scraper sources
  const seedSources = [
    {
      name: "Vinnova",
      type: "scrape",
      url: "https://www.vinnova.se/sok-finansiering/utlysningar/",
      scraperType: "beautifulsoup",
      active: true,
      updateFrequency: "daily",
    },
    {
      name: "Tillväxtverket",
      type: "scrape",
      url: "https://tillvaxtverket.se/finansiering",
      scraperType: "playwright",
      active: true,
      updateFrequency: "weekly",
    },
    {
      name: "EU Funding Portal",
      type: "api",
      url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities",
      scraperType: "api",
      active: false,
      updateFrequency: "daily",
    },
  ];

  await db.insert(scraperSources).values(seedSources);
  console.log(`Inserted ${seedSources.length} scraper sources`);

  // Get inserted sources to create logs
  const insertedSources = await db.select().from(scraperSources);
  
  // Seed some scraper logs
  const seedLogs = insertedSources.slice(0, 2).map((source, i) => ({
    sourceId: source.id,
    status: i === 0 ? "success" : "success",
    grantsFound: i === 0 ? 5 : 3,
    errorMessage: null,
    scrapedAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000), // 1-2 days ago
  }));

  await db.insert(scraperLogs).values(seedLogs);
  console.log(`Inserted ${seedLogs.length} scraper logs`);

  console.log("Database seeding completed!");
}
