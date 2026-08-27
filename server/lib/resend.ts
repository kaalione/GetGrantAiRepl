// Resend email client. Requires RESEND_API_KEY; RESEND_FROM_EMAIL
// optionally overrides the default sender.
import { Resend } from 'resend';

let resend: Resend | null = null;

function getClient(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set — cannot send email');
    }
    resend = new Resend(apiKey);
  }
  return resend;
}

export async function getResendClient() {
  return {
    client: getClient(),
    fromEmail: process.env.RESEND_FROM_EMAIL || 'getgrant.ai <notifications@getgrant.ai>'
  };
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const { client, fromEmail } = await getResendClient();

  const result = await client.emails.send({
    from: fromEmail,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  return result;
}
