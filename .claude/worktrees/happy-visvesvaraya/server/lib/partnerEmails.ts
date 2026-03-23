import { sendEmail } from './resend';

const BASE_URL = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : process.env.REPL_SLUG
    ? `https://${process.env.REPL_SLUG}.replit.app`
    : 'https://getgrant.ai';

interface BrandingContext {
  platformName: string;
  primaryColor: string;
  logoUrl?: string | null;
  supportEmail: string;
  subdomain: string;
}

const DEFAULT_BRANDING: BrandingContext = {
  platformName: 'GetGrant.ai',
  primaryColor: '#2563EB',
  supportEmail: 'support@getgrant.ai',
  subdomain: '',
};

function brandedEmailWrapper(title: string, content: string, branding: BrandingContext): string {
  const logoHtml = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${branding.platformName}" style="height: 40px; margin-bottom: 16px;">`
    : `<h2 style="margin: 0 0 16px 0; color: ${branding.primaryColor}; font-size: 20px;">${branding.platformName}</h2>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a; background: #f9fafb;">
  <div style="background: white; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      ${logoHtml}
      <h1 style="font-size: 20px; margin: 0; color: #111827;">${title}</h1>
    </div>
    ${content}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      ${branding.platformName} | <a href="${BASE_URL}/terms" style="color: #6b7280;">Villkor</a> | <a href="mailto:${branding.supportEmail}" style="color: #6b7280;">Support</a>
    </p>
  </div>
</body>
</html>`;
}

export async function sendClientInviteEmail(
  email: string,
  inviteUrl: string,
  partnerName: string,
  clientName?: string,
  branding?: BrandingContext
): Promise<void> {
  const context = branding || DEFAULT_BRANDING;
  try {
    await sendEmail({
      to: email,
      subject: `Du har bjudits in till ${context.platformName}`,
      html: brandedEmailWrapper('Du är inbjuden!', `
        <p style="font-size: 16px;">Hej${clientName ? ` ${clientName}` : ''},</p>
        <p><strong>${partnerName}</strong> har bjudit in dig till <strong>${context.platformName}</strong> för att tillsammans hantera bidragsansökningar och målstyrd tillväxt.</p>
        <div style="background: #f0f9ff; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid ${context.primaryColor};">
          <p style="margin: 0; font-size: 14px; color: #0369a1;"><strong>Din inbjudan gäller i 7 dagar</strong> — acceptera den innan den upphör.</p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${inviteUrl}" style="display: inline-block; background: ${context.primaryColor}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Acceptera inbjudan</a>
        </div>
        <p style="font-size: 13px; color: #6b7280;">Eller kopiera denna länk: <a href="${inviteUrl}" style="color: ${context.primaryColor};">${inviteUrl}</a></p>
      `, context)
    });
  } catch (error) {
    console.error('Failed to send client invite email:', error);
  }
}

export async function sendInviteReminderEmail(
  email: string,
  inviteUrl: string,
  partnerName: string,
  clientName?: string,
  branding?: BrandingContext
): Promise<void> {
  const context = branding || DEFAULT_BRANDING;
  try {
    await sendEmail({
      to: email,
      subject: `Påminnelse: Din inbjudan till ${context.platformName}`,
      html: brandedEmailWrapper('Påminnelse om inbjudan', `
        <p style="font-size: 16px;">Hej${clientName ? ` ${clientName}` : ''},</p>
        <p>Din inbjudan från <strong>${partnerName}</strong> till <strong>${context.platformName}</strong> förfaller snart.</p>
        <div style="background: #fffbeb; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; font-size: 14px; color: #92400e;"><strong>Acceptera innan inbjudan upphör</strong> — du har bara några dagar kvar.</p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${inviteUrl}" style="display: inline-block; background: ${context.primaryColor}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Acceptera nu</a>
        </div>
      `, context)
    });
  } catch (error) {
    console.error('Failed to send invite reminder email:', error);
  }
}

export async function sendClientWelcomeEmail(
  email: string,
  clientName: string,
  partnerName: string,
  loginUrl: string,
  branding?: BrandingContext
): Promise<void> {
  const context = branding || DEFAULT_BRANDING;
  try {
    await sendEmail({
      to: email,
      subject: `Välkommen till ${context.platformName}!`,
      html: brandedEmailWrapper('Välkommen ombord!', `
        <p style="font-size: 16px;">Hej ${clientName},</p>
        <p>Välkommen till <strong>${context.platformName}</strong>! Du är nu redo att tillsammans med <strong>${partnerName}</strong> utforska och ansöka om bidrag.</p>
        <h3 style="color: #111827; margin-top: 24px; margin-bottom: 12px;">Kom igång</h3>
        <ol style="font-size: 14px; line-height: 1.8; color: #4b5563;">
          <li><strong>Logga in</strong> och slutför din profil — detta hjälper oss hitta de bästa bidragen för dig</li>
          <li><strong>Utforska bidrag</strong> som passar din organisation och mål</li>
          <li><strong>Ansöka tillsammans</strong> — din partner kan ge feedback och stöd under processen</li>
          <li><strong>Få aviseringar</strong> när nya relevanta bidrag blir tillgängliga</li>
        </ol>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${loginUrl}" style="display: inline-block; background: ${context.primaryColor}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Logga in</a>
        </div>
        <p style="font-size: 13px; color: #6b7280; margin-top: 16px;"><strong>Behöver du hjälp?</strong> Kontakta ${partnerName} eller oss på <a href="mailto:${context.supportEmail}" style="color: ${context.primaryColor};">${context.supportEmail}</a>.</p>
      `, context)
    });
  } catch (error) {
    console.error('Failed to send client welcome email:', error);
  }
}

export async function sendPartnerWelcomeEmail(
  email: string,
  partnerName: string,
  plan: string
): Promise<void> {
  const context = DEFAULT_BRANDING;
  try {
    await sendEmail({
      to: email,
      subject: `Välkommen som partner — ${plan} plan`,
      html: brandedEmailWrapper('Välkommen som partner!', `
        <p style="font-size: 16px;">Hej ${partnerName},</p>
        <p>Tack för att du blir partner med <strong>${context.platformName}</strong>! Du är nu redo att börja arbeta tillsammans med dina kunder och öppna nya möjligheter för tillväxt.</p>
        <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Din plan:</strong> <span style="font-size: 16px; color: #059669;">${plan}</span></p>
          <p style="margin: 0; font-size: 13px; color: #6b7280;">Se detaljer och gränser i din partnerinstrumentpanel</p>
        </div>
        <h3 style="color: #111827; margin-top: 24px; margin-bottom: 12px;">Nästa steg</h3>
        <ol style="font-size: 14px; line-height: 1.8; color: #4b5563;">
          <li><strong>Anpassa din varumärkesidentitet</strong> — ladda upp din logotyp och välj färgschema</li>
          <li><strong>Konfigurera din domän</strong> — publicera på din egen URL för en sömlös kundupplevelse</li>
          <li><strong>Bjud in dina första kunder</strong> — låt dem på plattformen och börja samarbeta</li>
          <li><strong>Utforska avancerade funktioner</strong> — AI-drivna ansökningar, resultatrapportering och mer</li>
        </ol>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${BASE_URL}/partner/dashboard" style="display: inline-block; background: ${context.primaryColor}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Gå till instrumentpanelen</a>
        </div>
        <p style="font-size: 13px; color: #6b7280; margin-top: 16px;">Vi är här för att hjälpa! Kontakta oss på <a href="mailto:${context.supportEmail}" style="color: ${context.primaryColor};">${context.supportEmail}</a> om du har några frågor.</p>
      `, context)
    });
  } catch (error) {
    console.error('Failed to send partner welcome email:', error);
  }
}

export async function sendPartnerPlanChangeEmail(
  email: string,
  partnerName: string,
  newPlan: string,
  previousPlan: string
): Promise<void> {
  const context = DEFAULT_BRANDING;
  try {
    await sendEmail({
      to: email,
      subject: `Din plan har ändrats till ${newPlan}`,
      html: brandedEmailWrapper('Plananpassning bekräftad', `
        <p style="font-size: 16px;">Hej ${partnerName},</p>
        <p>Din partnerplan har uppdaterats med framgång.</p>
        <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Tidigare plan:</strong> ${previousPlan}</p>
          <p style="margin: 0;"><strong>Ny plan:</strong> <span style="font-size: 16px; color: #059669;">${newPlan}</span></p>
        </div>
        <h3 style="color: #111827; margin-top: 24px; margin-bottom: 12px;">Vad är nytt?</h3>
        <p style="font-size: 14px; color: #4b5563;">Din nya plan innehåller uppdaterade funktioner, gränser och resurser. Se alla detaljer i din instrumentpanel.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${BASE_URL}/partner/dashboard/settings" style="display: inline-block; background: ${context.primaryColor}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Visa planbeskrivning</a>
        </div>
        <p style="font-size: 13px; color: #6b7280; margin-top: 16px;">Har du frågor om dina nya funktioner? <a href="mailto:${context.supportEmail}" style="color: ${context.primaryColor};">Kontakta support</a>.</p>
      `, context)
    });
  } catch (error) {
    console.error('Failed to send partner plan change email:', error);
  }
}

export async function sendDomainVerifiedEmail(
  email: string,
  partnerName: string,
  domain: string
): Promise<void> {
  const context = DEFAULT_BRANDING;
  try {
    await sendEmail({
      to: email,
      subject: `Din domän ${domain} har verifierats`,
      html: brandedEmailWrapper('Domänverifiering lyckades', `
        <p style="font-size: 16px;">Hej ${partnerName},</p>
        <p>Gratulerar! Din domän har verifierats och är nu aktiv.</p>
        <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Domän:</strong> <span style="font-family: monospace; color: #059669;">${domain}</span></p>
          <p style="margin: 0;"><strong>Status:</strong> <span style="color: #059669;">✓ Verifierad</span></p>
        </div>
        <h3 style="color: #111827; margin-top: 24px; margin-bottom: 12px;">Säkerhet</h3>
        <ul style="font-size: 14px; line-height: 1.8; color: #4b5563;">
          <li><strong>SSL-certifikat</strong> — Din domän är automatiskt skyddad med HTTPS</li>
          <li><strong>Varumärkestrust</strong> — Dina kunder ser din domän när de loggar in och använder systemet</li>
          <li><strong>E-postkonfiguration</strong> — Du kan skicka e-postmeddelanden från din egen domän</li>
        </ul>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${BASE_URL}/partner/dashboard/domain" style="display: inline-block; background: ${context.primaryColor}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Administrera domän</a>
        </div>
        <p style="font-size: 13px; color: #6b7280; margin-top: 16px;">Allt ser bra ut! Du kan nu börja bjuda in kunder på din egen domän.</p>
      `, context)
    });
  } catch (error) {
    console.error('Failed to send domain verified email:', error);
  }
}
