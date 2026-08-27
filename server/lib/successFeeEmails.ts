import { sendEmail } from './resend';
import type { SuccessFeeAgreement } from '@shared/schema';
import type { FeeCalculation } from '../services/successFee';
import { APP_URL as BASE_URL } from './appUrl';

function emailWrapper(title: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a; background: #f9fafb;">
  <div style="background: white; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 20px; margin: 0; color: #111827;">${title}</h1>
    </div>
    ${content}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      GetGrant.ai | <a href="${BASE_URL}/terms/success-fee" style="color: #6b7280;">Villkor</a> | <a href="mailto:support@getgrant.ai" style="color: #6b7280;">Support</a>
    </p>
  </div>
</body>
</html>`;
}

export async function sendOutcomeWonEmail(
  email: string,
  agreement: SuccessFeeAgreement,
  feeCalc: FeeCalculation,
  invoiceUrl: string,
  dueDate: string
): Promise<void> {
  try {
    await sendEmail({
      to: email,
      subject: `Grattis! Ditt bidrag "${agreement.grantTitle}" har godkänts — faktura skickad`,
      html: emailWrapper('Bidraget godkänt!', `
        <p style="font-size: 16px;">Grattis! Ditt bidrag har godkänts av <strong>${agreement.funder}</strong>.</p>
        <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Bidrag:</strong> ${agreement.grantTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Godkänt belopp:</strong> ${feeCalc.approvedAmountSek.toLocaleString('sv-SE')} SEK</p>
          <p style="margin: 0 0 8px 0;"><strong>Framgångsavgift (${feeCalc.feePercentage}%):</strong> ${feeCalc.finalFeeSek.toLocaleString('sv-SE')} SEK</p>
          ${feeCalc.capApplied ? '<p style="margin: 0 0 8px 0; font-size: 13px; color: #059669;">Maxtak tillämpat</p>' : ''}
          ${feeCalc.minimumApplied ? '<p style="margin: 0 0 8px 0; font-size: 13px; color: #059669;">Minimiavgift tillämpad</p>' : ''}
          <p style="margin: 0;"><strong>Förfallodatum:</strong> ${dueDate}</p>
        </div>
        <p>En faktura har skickats via Stripe. Du kan betala den via länken nedan.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${invoiceUrl}" style="display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Visa och betala faktura</a>
        </div>
        <p style="font-size: 13px; color: #6b7280;">Betalning ska ske inom 30 dagar. Om du har frågor, kontakta oss på support@getgrant.ai.</p>
      `)
    });
  } catch (error) {
    console.error('Failed to send outcome won email:', error);
  }
}

export async function sendOutcomeRejectedEmail(
  email: string,
  agreement: SuccessFeeAgreement
): Promise<void> {
  try {
    await sendEmail({
      to: email,
      subject: `Tyvärr — bidraget "${agreement.grantTitle}" nekades`,
      html: emailWrapper('Bidraget nekades', `
        <p>Vi beklagar att ditt bidrag hos <strong>${agreement.funder}</strong> inte godkändes denna gång.</p>
        <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Bidrag:</strong> ${agreement.grantTitle}</p>
        </div>
        <p><strong>Ingen avgift debiteras</strong> — du betalar bara vid godkänt bidrag.</p>
        <p>Vi rekommenderar att du:</p>
        <ul>
          <li>Granskar feedback från finansiären (om tillgänglig)</li>
          <li>Utforskar liknande bidrag i vår databas</li>
          <li>Använder AI-skrivstödet för att förbättra nästa ansökan</li>
        </ul>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${BASE_URL}/bidrag" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Utforska fler bidrag</a>
        </div>
      `)
    });
  } catch (error) {
    console.error('Failed to send outcome rejected email:', error);
  }
}

export async function sendInvoicePaidEmail(
  email: string,
  agreement: SuccessFeeAgreement
): Promise<void> {
  try {
    await sendEmail({
      to: email,
      subject: `Betalning mottagen — ${agreement.grantTitle}`,
      html: emailWrapper('Betalning bekräftad', `
        <p>Tack! Din framgångsavgift för <strong>${agreement.grantTitle}</strong> har betalats.</p>
        <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Bidrag:</strong> ${agreement.grantTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Avgift betald:</strong> ${(agreement.calculatedFeeSek || 0).toLocaleString('sv-SE')} SEK</p>
          <p style="margin: 0;"><strong>Finansiär:</strong> ${agreement.funder}</p>
        </div>
        <p style="font-size: 13px; color: #6b7280;">Kvittot finns tillgängligt i din Stripe-portal. Om du behöver en formell faktura, kontakta support@getgrant.ai.</p>
      `)
    });
  } catch (error) {
    console.error('Failed to send invoice paid email:', error);
  }
}

export async function sendPaymentFailedEmail(
  email: string,
  agreement: SuccessFeeAgreement
): Promise<void> {
  try {
    await sendEmail({
      to: email,
      subject: `Betalning misslyckades — ${agreement.grantTitle}`,
      html: emailWrapper('Betalningen kunde inte genomföras', `
        <p>Vi kunde inte genomföra betalningen för din framgångsavgift.</p>
        <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Bidrag:</strong> ${agreement.grantTitle}</p>
          <p style="margin: 0;"><strong>Belopp:</strong> ${(agreement.calculatedFeeSek || 0).toLocaleString('sv-SE')} SEK</p>
        </div>
        <p>Kontrollera din betalningsmetod och försök igen via fakturalänken:</p>
        ${agreement.stripeInvoiceUrl ? `
        <div style="text-align: center; margin: 24px 0;">
          <a href="${agreement.stripeInvoiceUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Försök betala igen</a>
        </div>` : ''}
        <p style="font-size: 13px; color: #6b7280;">Om du har frågor, kontakta oss på support@getgrant.ai.</p>
      `)
    });
  } catch (error) {
    console.error('Failed to send payment failed email:', error);
  }
}

export async function sendPaymentReminderEmail(
  email: string,
  agreement: SuccessFeeAgreement,
  daysUntilDue: number
): Promise<void> {
  try {
    const urgency = daysUntilDue <= 0 ? 'Förfallen' : `${daysUntilDue} dagar kvar`;
    await sendEmail({
      to: email,
      subject: `Betalningspåminnelse — ${agreement.grantTitle} (${urgency})`,
      html: emailWrapper('Betalningspåminnelse', `
        <p>Det här är en påminnelse om din utestående framgångsavgift.</p>
        <div style="background: ${daysUntilDue <= 0 ? '#fef2f2' : '#fffbeb'}; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Bidrag:</strong> ${agreement.grantTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Belopp:</strong> ${(agreement.calculatedFeeSek || 0).toLocaleString('sv-SE')} SEK</p>
          <p style="margin: 0 0 8px 0;"><strong>Förfallodatum:</strong> ${agreement.invoiceDueDate || 'Ej angivet'}</p>
          <p style="margin: 0; font-weight: 600; color: ${daysUntilDue <= 0 ? '#dc2626' : '#d97706'};">${urgency}</p>
        </div>
        ${agreement.stripeInvoiceUrl ? `
        <div style="text-align: center; margin: 24px 0;">
          <a href="${agreement.stripeInvoiceUrl}" style="display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Betala nu</a>
        </div>` : ''}
      `)
    });
  } catch (error) {
    console.error('Failed to send payment reminder email:', error);
  }
}
