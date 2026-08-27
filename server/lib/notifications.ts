// Notification functions for grant matching and deadline reminders
import { sendEmail } from './resend';
import { APP_URL } from './appUrl';
import { storage } from '../storage';
import { calculateMatchScore } from '../../client/src/lib/matching';
import { grantMatchesAlert, computeMatchScore, getAlertNotificationEmail, getAlertProfile } from './alert-matching';
import type { Grant, Company, InsertNotification, NotificationPreference, GrantAlert } from '@shared/schema';

const MIN_MATCH_SCORE = 50; // Minimum score to trigger notification

type MarketCode = 'se' | 'no' | 'fi';

const emailStrings: Record<MarketCode, {
  newGrantSubject: (company: string, grant: string) => string;
  newGrantHeader: string;
  newGrantSubHeader: (company: string) => string;
  source: string;
  amount: string;
  deadline: string;
  notSpecified: string;
  viewDetails: string;
  footerNotif: (company: string) => string;
  footerTagline: string;
  deadlineApproaching: string;
  deadlineMissNotice: string;
  deadlineUrgent1: string;
  deadlineUrgent3: (days: number) => string;
  deadlineNormal: (days: number) => string;
  goToApplication: string;
  deadlineFooter: string;
  upTo: string;
  locale: string;
  currency: string;
}> = {
  se: {
    newGrantSubject: (c, g) => `Nytt bidrag som matchar ${c}: ${g}`,
    newGrantHeader: 'Nytt bidrag att söka!',
    newGrantSubHeader: (c) => `Vi har hittat ett bidrag som matchar ${c}`,
    source: 'Källa',
    amount: 'Belopp',
    deadline: 'Deadline',
    notSpecified: 'Ej angivet',
    viewDetails: 'Se fullständig information',
    footerNotif: (c) => `Du får detta mejl eftersom du har aktiverat notifikationer för ${c} i getgrant.ai.`,
    footerTagline: 'getgrant.ai - AI-driven bidragsplattform',
    deadlineApproaching: 'Deadline närmar sig!',
    deadlineMissNotice: 'Missa inte chansen att söka detta bidrag',
    deadlineUrgent1: 'Det är bara en dag kvar! Skynda dig att skicka in din ansökan.',
    deadlineUrgent3: (d) => `Det är bara ${d} dagar kvar. Se till att slutföra din ansökan i tid.`,
    deadlineNormal: (d) => `Det är ${d} dagar kvar till deadline. Bra tid att förbereda din ansökan!`,
    goToApplication: 'Gå till ansökan',
    deadlineFooter: 'Du får denna påminnelse eftersom du har ett pågående utkast för detta bidrag.',
    upTo: 'Upp till',
    locale: 'sv-SE',
    currency: 'SEK',
  },
  no: {
    newGrantSubject: (c, g) => `Nytt tilskudd som passer ${c}: ${g}`,
    newGrantHeader: 'Nytt tilskudd å søke!',
    newGrantSubHeader: (c) => `Vi har funnet et tilskudd som passer ${c}`,
    source: 'Kilde',
    amount: 'Beløp',
    deadline: 'Frist',
    notSpecified: 'Ikke oppgitt',
    viewDetails: 'Se fullstendig informasjon',
    footerNotif: (c) => `Du mottar denne e-posten fordi du har aktivert varsler for ${c} i getgrant.ai.`,
    footerTagline: 'getgrant.ai - AI-drevet tilskuddsplattform',
    deadlineApproaching: 'Fristen nærmer seg!',
    deadlineMissNotice: 'Ikke gå glipp av muligheten til å søke dette tilskuddet',
    deadlineUrgent1: 'Det er bare én dag igjen! Skynd deg å sende inn søknaden din.',
    deadlineUrgent3: (d) => `Det er bare ${d} dager igjen. Sørg for å fullføre søknaden din i tide.`,
    deadlineNormal: (d) => `Det er ${d} dager igjen til fristen. God tid til å forberede søknaden din!`,
    goToApplication: 'Gå til søknad',
    deadlineFooter: 'Du mottar denne påminnelsen fordi du har et pågående utkast for dette tilskuddet.',
    upTo: 'Opptil',
    locale: 'nb-NO',
    currency: 'NOK',
  },
  fi: {
    newGrantSubject: (c, g) => `Uusi avustus yrityksellesi ${c}: ${g}`,
    newGrantHeader: 'Uusi avustus haettavana!',
    newGrantSubHeader: (c) => `Löysimme avustuksen, joka sopii yrityksellesi ${c}`,
    source: 'Lähde',
    amount: 'Summa',
    deadline: 'Määräaika',
    notSpecified: 'Ei ilmoitettu',
    viewDetails: 'Katso tarkemmat tiedot',
    footerNotif: (c) => `Saat tämän viestin, koska olet ottanut käyttöön ilmoitukset yritykselle ${c} getgrant.ai:ssa.`,
    footerTagline: 'getgrant.ai - Tekoälypohjainen avustusalusta',
    deadlineApproaching: 'Määräaika lähestyy!',
    deadlineMissNotice: 'Älä missaa mahdollisuutta hakea tätä avustusta',
    deadlineUrgent1: 'Vain yksi päivä jäljellä! Kiiruhda lähettämään hakemuksesi.',
    deadlineUrgent3: (d) => `Vain ${d} päivää jäljellä. Varmista, että saat hakemuksen valmiiksi ajoissa.`,
    deadlineNormal: (d) => `Määräaikaan on ${d} päivää. Hyvää aikaa valmistella hakemuksesi!`,
    goToApplication: 'Siirry hakemukseen',
    deadlineFooter: 'Saat tämän muistutuksen, koska sinulla on keskeneräinen luonnos tästä avustuksesta.',
    upTo: 'Enintään',
    locale: 'fi-FI',
    currency: 'EUR',
  },
};

function getMarketStrings(company: Company) {
  const market = ((company as any).market || 'se') as MarketCode;
  return emailStrings[market] || emailStrings.se;
}

async function getUserPrefsForCompany(company: Company): Promise<NotificationPreference | null> {
  if (!company.userId) return null;
  try {
    const prefs = await storage.getNotificationPreferences(company.userId);
    return prefs || null;
  } catch {
    return null;
  }
}

interface NotificationResult {
  sent: number;
  errors: string[];
}

export async function sendNewGrantNotification(
  company: Company,
  grant: Grant,
  matchScore: number
): Promise<boolean> {
  if (!company.notificationEmail || !company.notificationsEnabled) {
    return false;
  }

  const s = getMarketStrings(company);

  const deadlineStr = grant.deadline 
    ? new Date(grant.deadline).toLocaleDateString(s.locale)
    : s.notSpecified;
  
  const currSymbol = s.currency === 'EUR' ? '€' : 'kr';
  const amountStr = grant.amountMin && grant.amountMax
    ? `${Number(grant.amountMin).toLocaleString(s.locale)} - ${Number(grant.amountMax).toLocaleString(s.locale)} ${currSymbol}`
    : grant.amountMax
    ? `${s.upTo} ${Number(grant.amountMax).toLocaleString(s.locale)} ${currSymbol}`
    : s.notSpecified;

  try {
    await sendEmail({
      to: company.notificationEmail,
      subject: s.newGrantSubject(company.companyName, grant.title),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; }
            .match-badge { display: inline-block; background: #28a745; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; }
            .grant-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .detail { margin: 10px 0; }
            .label { color: #666; font-size: 14px; }
            .value { font-weight: 600; }
            .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">${s.newGrantHeader}</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">${s.newGrantSubHeader(company.companyName)}</p>
            </div>
            <div class="content">
              <div class="match-badge">Match: ${matchScore}%</div>
              
              <div class="grant-card">
                <h2 style="margin: 0 0 15px 0; color: #333;">${grant.title}</h2>
                <p style="color: #666; margin: 0 0 20px 0;">${grant.description.substring(0, 200)}${grant.description.length > 200 ? '...' : ''}</p>
                
                <div class="detail">
                  <span class="label">${s.source}:</span>
                  <span class="value">${grant.sourceName}</span>
                </div>
                <div class="detail">
                  <span class="label">${s.amount}:</span>
                  <span class="value">${amountStr}</span>
                </div>
                <div class="detail">
                  <span class="label">${s.deadline}:</span>
                  <span class="value">${deadlineStr}</span>
                </div>
              </div>
              
              <a href="${grant.url}" class="cta-button">${s.viewDetails}</a>
            </div>
            <div class="footer">
              <p>${s.footerNotif(company.companyName)}</p>
              <p>${s.footerTagline}</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    return true;
  } catch (error) {
    console.error('Failed to send new grant notification:', error);
    return false;
  }
}

export async function sendDeadlineReminder(
  company: Company,
  grant: Grant,
  daysUntilDeadline: number
): Promise<boolean> {
  if (!company.notificationEmail || !company.notificationsEnabled) {
    return false;
  }

  const s = getMarketStrings(company);

  const deadlineStr = grant.deadline 
    ? new Date(grant.deadline).toLocaleDateString(s.locale)
    : s.notSpecified;

  const urgencyMap: Record<MarketCode, { tomorrow: string; inDays: (d: number) => string }> = {
    se: { tomorrow: 'IMORGON', inDays: (d) => `om ${d} dagar` },
    no: { tomorrow: 'I MORGEN', inDays: (d) => `om ${d} dager` },
    fi: { tomorrow: 'HUOMENNA', inDays: (d) => `${d} päivän päästä` },
  };
  const companyMarket = ((company as any).market || 'se') as MarketCode;
  const urgency = urgencyMap[companyMarket] || urgencyMap.se;
  const urgencyText = daysUntilDeadline === 1 
    ? urgency.tomorrow 
    : urgency.inDays(daysUntilDeadline);

  try {
    await sendEmail({
      to: company.notificationEmail,
      subject: `${s.deadlineApproaching} ${grant.title} - ${urgencyText}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${daysUntilDeadline <= 1 ? '#dc3545' : daysUntilDeadline <= 3 ? '#ffc107' : '#17a2b8'}; color: ${daysUntilDeadline <= 3 && daysUntilDeadline > 1 ? '#333' : 'white'}; padding: 30px; border-radius: 12px 12px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; }
            .deadline-badge { display: inline-block; background: ${daysUntilDeadline <= 1 ? '#dc3545' : '#333'}; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 18px; }
            .grant-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">${s.deadlineApproaching}</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">${s.deadlineMissNotice}</p>
            </div>
            <div class="content">
              <div class="deadline-badge">${s.deadline}: ${deadlineStr}</div>
              
              <div class="grant-card">
                <h2 style="margin: 0 0 15px 0; color: #333;">${grant.title}</h2>
                <p style="color: #666; margin: 0 0 20px 0;">${grant.description.substring(0, 200)}${grant.description.length > 200 ? '...' : ''}</p>
                <p style="margin: 0;"><strong>${s.source}:</strong> ${grant.sourceName}</p>
              </div>
              
              <p style="font-size: 16px; color: #333;">
                ${daysUntilDeadline === 1 
                  ? s.deadlineUrgent1
                  : daysUntilDeadline <= 3
                  ? s.deadlineUrgent3(daysUntilDeadline)
                  : s.deadlineNormal(daysUntilDeadline)
                }
              </p>
              
              <a href="${grant.url}" class="cta-button">${s.goToApplication}</a>
            </div>
            <div class="footer">
              <p>${s.deadlineFooter}</p>
              <p>${s.footerTagline}</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    return true;
  } catch (error) {
    console.error('Failed to send deadline reminder:', error);
    return false;
  }
}

export async function processNewGrantNotifications(): Promise<NotificationResult> {
  const result: NotificationResult = { sent: 0, errors: [] };
  
  try {
    const companies = await storage.getCompanies();
    const companiesWithEmail = companies.filter(c => c.notificationEmail && c.notificationsEnabled);
    
    if (companiesWithEmail.length === 0) {
      return result;
    }

    // Get grants created in the last 24 hours
    const recentGrants = await storage.getGrantsCreatedSince(new Date(Date.now() - 24 * 60 * 60 * 1000));
    
    for (const company of companiesWithEmail) {
      const prefs = await getUserPrefsForCompany(company);
      
      if (prefs && !prefs.emailNotificationsEnabled) continue;
      if (prefs && !prefs.newGrantsEnabled) continue;
      
      const minScore = prefs?.newGrantsMinMatchScore ?? MIN_MATCH_SCORE;
      
      for (const grant of recentGrants) {
        const matchResult = calculateMatchScore(company, grant);
        
        if (matchResult.score >= minScore) {
          const alreadySent = await storage.hasNotification(company.id, grant.id, 'new_grant_match');
          if (alreadySent) continue;
          
          const sent = await sendNewGrantNotification(company, grant, matchResult.score);
          if (sent) {
            await storage.createNotification({
              companyId: company.id,
              grantId: grant.id,
              type: 'new_grant_match',
              email: company.notificationEmail!,
            });
            result.sent++;
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`New grant notifications: ${message}`);
  }
  
  return result;
}

export async function processDeadlineReminders(): Promise<NotificationResult> {
  const result: NotificationResult = { sent: 0, errors: [] };
  
  try {
    const applications = await storage.getApplications();
    const draftApplications = applications.filter(a => a.status === 'draft' || a.status === 'generated');
    
    for (const app of draftApplications) {
      if (!app.grantId || !app.companyId) continue;
      
      const grant = await storage.getGrant(app.grantId);
      const company = await storage.getCompany(app.companyId);
      
      if (!grant?.deadline || !company?.notificationEmail || !company.notificationsEnabled) continue;
      
      const prefs = await getUserPrefsForCompany(company);
      if (prefs && !prefs.emailNotificationsEnabled) continue;
      if (prefs && !prefs.deadlineRemindersEnabled) continue;
      
      const daysUntilDeadline = Math.ceil(
        (new Date(grant.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      
      const rawDays = prefs?.deadlineReminderDays;
      const reminderDays = Array.isArray(rawDays) ? rawDays.map(Number).filter(d => !isNaN(d)) : [7, 3, 1];
      
      for (const days of reminderDays) {
        if (daysUntilDeadline === days) {
          const type = `deadline_reminder_${days}d` as const;
          
          const alreadySent = await storage.hasNotification(company.id, grant.id, type);
          if (alreadySent) continue;
          
          const sent = await sendDeadlineReminder(company, grant, days);
          if (sent) {
            await storage.createNotification({
              companyId: company.id,
              grantId: grant.id,
              type,
              email: company.notificationEmail,
            });
            result.sent++;
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Deadline reminders: ${message}`);
  }
  
  return result;
}

// Weekly digest email with all matching grants from the past week
export async function sendWeeklyDigest(
  company: Company,
  matchingGrants: Array<{ grant: Grant; score: number }>
): Promise<boolean> {
  if (!company.notificationEmail || !company.notificationsEnabled) {
    return false;
  }

  if (matchingGrants.length === 0) {
    return false;
  }

  const grantsHtml = matchingGrants
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ grant, score }) => {
      const deadlineStr = grant.deadline 
        ? new Date(grant.deadline).toLocaleDateString('sv-SE')
        : 'Ingen deadline';
      
      return `
        <tr>
          <td style="padding: 15px; border-bottom: 1px solid #eee;">
            <div style="font-weight: 600; color: #333; margin-bottom: 5px;">${grant.title}</div>
            <div style="color: #666; font-size: 14px;">${grant.sourceName} | Deadline: ${deadlineStr}</div>
          </td>
          <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: center; width: 80px;">
            <div style="background: ${score >= 70 ? '#28a745' : score >= 50 ? '#ffc107' : '#6c757d'}; color: ${score >= 50 && score < 70 ? '#333' : 'white'}; padding: 6px 12px; border-radius: 15px; font-weight: bold; font-size: 14px;">
              ${score}%
            </div>
          </td>
          <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: center; width: 100px;">
            <a href="${grant.url}" style="color: #667eea; text-decoration: none; font-weight: 500;">Visa &rarr;</a>
          </td>
        </tr>
      `;
    })
    .join('');

  try {
    await sendEmail({
      to: company.notificationEmail,
      subject: `Veckans bidrag: ${matchingGrants.length} nya möjligheter för ${company.companyName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 650px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .content { background: #ffffff; padding: 30px; border: 1px solid #e9ecef; border-top: none; }
            .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px; }
            .summary-stat { display: inline-block; text-align: center; margin: 0 15px; }
            .summary-number { font-size: 28px; font-weight: bold; color: #667eea; }
            .summary-label { font-size: 13px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .cta-button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { background: #f8f9fa; padding: 25px; border-radius: 0 0 12px 12px; text-align: center; border: 1px solid #e9ecef; border-top: none; }
            .footer p { margin: 5px 0; color: #666; font-size: 12px; }
            .unsubscribe { color: #999; font-size: 11px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0 0 10px 0; font-size: 24px;">Veckans bidragsöversikt</h1>
              <p style="margin: 0; opacity: 0.9;">Sammanställning för ${company.companyName}</p>
            </div>
            <div class="content">
              <div class="summary">
                <div class="summary-stat">
                  <div class="summary-number">${matchingGrants.length}</div>
                  <div class="summary-label">Nya matchande bidrag</div>
                </div>
                <div class="summary-stat">
                  <div class="summary-number">${matchingGrants.filter(g => g.score >= 70).length}</div>
                  <div class="summary-label">Höga matchningar (70%+)</div>
                </div>
              </div>
              
              <h2 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">Bidrag som matchar er profil</h2>
              
              <table>
                <thead>
                  <tr style="background: #f8f9fa;">
                    <th style="padding: 12px 15px; text-align: left; font-size: 12px; color: #666; text-transform: uppercase;">Bidrag</th>
                    <th style="padding: 12px 15px; text-align: center; font-size: 12px; color: #666; text-transform: uppercase;">Match</th>
                    <th style="padding: 12px 15px; text-align: center; font-size: 12px; color: #666; text-transform: uppercase;"></th>
                  </tr>
                </thead>
                <tbody>
                  ${grantsHtml}
                </tbody>
              </table>
              
              ${matchingGrants.length > 10 ? `<p style="color: #666; font-size: 14px; text-align: center;">...och ${matchingGrants.length - 10} fler bidrag</p>` : ''}
              
              <div style="text-align: center;">
                <a href="https://bidragai.se/bidrag" class="cta-button">Se alla matchande bidrag</a>
              </div>
            </div>
            <div class="footer">
              <p><strong>getgrant.ai</strong> - AI-driven bidragsplattform för svenska företag</p>
              <p>Hitta, matcha och ansök om bidrag smartare.</p>
              <p class="unsubscribe">
                Du får detta mejl varje vecka. Ändra dina notifieringsinställningar i din företagsprofil på getgrant.ai.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    return true;
  } catch (error) {
    console.error('Failed to send weekly digest:', error);
    return false;
  }
}

export async function processWeeklyDigest(): Promise<NotificationResult> {
  const result: NotificationResult = { sent: 0, errors: [] };
  
  try {
    const companies = await storage.getCompanies();
    const companiesWithEmail = companies.filter(c => c.notificationEmail && c.notificationsEnabled);
    
    if (companiesWithEmail.length === 0) {
      return result;
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentGrants = await storage.getGrantsCreatedSince(weekAgo);
    
    for (const company of companiesWithEmail) {
      const prefs = await getUserPrefsForCompany(company);
      if (prefs && !prefs.emailNotificationsEnabled) continue;
      if (prefs && !prefs.weeklyDigestEnabled) continue;
      
      const minScore = prefs?.newGrantsMinMatchScore ?? MIN_MATCH_SCORE;
      const matchingGrants: Array<{ grant: Grant; score: number }> = [];
      
      for (const grant of recentGrants) {
        const matchResult = calculateMatchScore(company, grant);
        if (matchResult.score >= minScore) {
          matchingGrants.push({ grant, score: matchResult.score });
        }
      }
      
      if (matchingGrants.length > 0) {
        const digestType = 'weekly_digest';
        const weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        
        const existingDigest = await storage.getNotificationsSince(company.id, digestType, weekStart);
        if (existingDigest.length > 0) continue;
        
        const sent = await sendWeeklyDigest(company, matchingGrants);
        if (sent) {
          await storage.createNotification({
            companyId: company.id,
            grantId: matchingGrants[0].grant.id,
            type: digestType,
            email: company.notificationEmail!,
          });
          result.sent++;
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Weekly digest: ${message}`);
  }
  
  return result;
}

export async function processAlertMatches(): Promise<NotificationResult> {
  const result: NotificationResult = { sent: 0, errors: [] };

  try {
    const activeAlerts = await storage.getActiveAlerts();
    if (activeAlerts.length === 0) return result;

    const recentGrants = await storage.getGrantsCreatedSince(new Date(Date.now() - 24 * 60 * 60 * 1000));
    if (recentGrants.length === 0) return result;

    for (const alert of activeAlerts) {
      let company: Company | null = null;
      if (alert.companyId) {
        company = (await storage.getCompany(alert.companyId)) || null;
      }
      const alertProfile = await getAlertProfile(alert);

      for (const grant of recentGrants) {
        if (!grantMatchesAlert(grant, alert)) continue;

        const matchScore = computeMatchScore(company, grant, alertProfile);

        if (matchScore < (alert.minMatchScore || 60)) continue;

        const exists = await storage.hasAlertMatch(alert.id, grant.id);
        if (exists) continue;

        await storage.createAlertMatch({
          alertId: alert.id,
          grantId: grant.id,
          matchScore,
        });

        if (alert.notifyImmediately) {
          try {
            const appUrl = APP_URL;
            const deadlineStr = grant.deadline
              ? new Date(grant.deadline).toLocaleDateString('sv-SE')
              : 'Ingen deadline';

            const userEmail = await getAlertNotificationEmail(alert);

            if (userEmail) {
              await sendEmail({
                to: userEmail,
                subject: `Ny matchning: ${alert.name}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #3b82f6;">Ny Grant Alert</h1>
                    <p>Din bevakning "<strong>${alert.name}</strong>" har matchat ett nytt bidrag!</p>
                    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <h2 style="margin: 0 0 10px 0;">${grant.title}</h2>
                      <p style="margin: 0;"><strong>Källa:</strong> ${grant.sourceName}</p>
                      <p style="margin: 10px 0 0 0;"><strong>Matchning:</strong> <span style="color: #10b981; font-size: 24px;">${matchScore}%</span></p>
                      <p style="margin: 10px 0 0 0;"><strong>Deadline:</strong> ${deadlineStr}</p>
                    </div>
                    <a href="${appUrl}/bidrag/${grant.id}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Se bidragsdetaljer</a>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px;">Du får detta mail eftersom du har en aktiv bevakning på GetGrant.ai. <a href="${appUrl}/alerts" style="color: #3b82f6;">Hantera bevakningar</a></p>
                  </div>
                `,
              });
              result.sent++;
            }
          } catch (emailError) {
            console.error('Alert notification email error:', emailError);
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Alert matches: ${message}`);
  }

  return result;
}
