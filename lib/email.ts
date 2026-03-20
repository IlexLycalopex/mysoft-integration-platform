import { Resend } from 'resend';

// Lazy-initialised so missing env var doesn't throw at module evaluation
// time (which breaks Next.js build-time page-data collection).
function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === 'your-resend-api-key-here') {
    throw new Error('RESEND_API_KEY environment variable is not configured.');
  }
  return new Resend(key);
}

const FROM = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

export interface EmailBranding {
  brand_name?: string | null;
  support_email?: string | null;
}

export async function sendJobCompletedEmail({
  to, filename, processed, errors, jobUrl, branding,
}: {
  to: string; filename: string; processed: number; errors: number; jobUrl: string; branding?: EmailBranding;
}) {
  const hasErrors = errors > 0;
  const statusColour = hasErrors ? '#92620A' : '#1A6B30';
  const statusBg = hasErrors ? '#FFF8E6' : '#E6F7ED';
  const statusText = hasErrors ? `Completed with ${errors} error${errors !== 1 ? 's' : ''}` : 'Completed successfully';
  const platformName = branding?.brand_name ?? 'Mysoft Integration Platform';
  const supportEmail = branding?.support_email ?? 'support@mysoftx3.com';

  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Job ${hasErrors ? 'completed with errors' : 'completed'}: ${filename}`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #D8E2EA; border-radius: 12px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 600; color: #003D5B;">${platformName}</span>
        </div>
        <h2 style="color: #1A2B38; font-size: 20px; margin-bottom: 12px;">Processing complete</h2>
        <div style="background: ${statusBg}; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 600; color: ${statusColour}; margin-bottom: 4px;">${statusText}</div>
          <div style="font-size: 13px; color: #1A2B38;">${filename}</div>
          <div style="font-size: 12px; color: #6B8599; margin-top: 8px;">${processed} row${processed !== 1 ? 's' : ''} processed${errors > 0 ? ` · ${errors} error${errors !== 1 ? 's' : ''}` : ''}</div>
        </div>
        <a href="${jobUrl}" style="display: inline-block; background: #00A3E0; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">
          View job
        </a>
        <p style="color: #6B8599; font-size: 12px; margin-top: 24px;">If you need help, contact <a href="mailto:${supportEmail}" style="color: #00A3E0;">${supportEmail}</a>.</p>
      </div>
    `,
  });
}

export async function sendJobFailedEmail({
  to, filename, errorMessage, jobUrl, branding,
}: {
  to: string; filename: string; errorMessage: string; jobUrl: string; branding?: EmailBranding;
}) {
  const platformName = branding?.brand_name ?? 'Mysoft Integration Platform';
  const supportEmail = branding?.support_email ?? 'support@mysoftx3.com';

  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Job failed: ${filename}`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #D8E2EA; border-radius: 12px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 600; color: #003D5B;">${platformName}</span>
        </div>
        <h2 style="color: #1A2B38; font-size: 20px; margin-bottom: 12px;">Processing failed</h2>
        <div style="background: #FDE8E6; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 600; color: #9B2B1E; margin-bottom: 4px;">Failed</div>
          <div style="font-size: 13px; color: #1A2B38;">${filename}</div>
          <div style="font-size: 12px; color: #9B2B1E; margin-top: 8px;">${errorMessage}</div>
        </div>
        <a href="${jobUrl}" style="display: inline-block; background: #00A3E0; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">
          View job
        </a>
        <p style="color: #6B8599; font-size: 12px; margin-top: 24px;">If you need help, contact <a href="mailto:${supportEmail}" style="color: #00A3E0;">${supportEmail}</a>.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}) {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: 'Reset your Mysoft Integration Platform password',
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #D8E2EA; border-radius: 12px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 600; color: #003D5B;">Mysoft <span style="color: #00A3E0;">Integrations</span></span>
        </div>
        <h2 style="color: #1A2B38; font-size: 20px; margin-bottom: 12px;">Reset your password</h2>
        <p style="color: #6B8599; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
          Click the button below to set a new password for your account. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}" style="display: inline-block; background: #00A3E0; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-bottom: 24px;">
          Reset password
        </a>
        <p style="color: #6B8599; font-size: 12px; margin-top: 16px;">
          If you did not request a password reset, you can safely ignore this email.
        </p>
        <p style="color: #D8E2EA; font-size: 11px; margin-top: 24px;">Or copy this URL: ${resetUrl}</p>
      </div>
    `,
  });
}

export async function sendAlertEmail({
  to, alertType, message, jobUrl,
}: {
  to: string; alertType: string; message: string; jobUrl?: string;
}) {
  const alertLabels: Record<string, { subject: string; title: string; colour: string; bg: string }> = {
    agent_offline:    { subject: 'Alert: Agent offline',          title: 'Agent offline',       colour: '#92620A', bg: '#FFF8E6' },
    stuck_job:        { subject: 'Alert: Job stuck in processing', title: 'Job stuck',           colour: '#9B2B1E', bg: '#FDE8E6' },
    high_error_rate:  { subject: 'Warning: High error rate',       title: 'High error rate',     colour: '#92620A', bg: '#FFF8E6' },
  };

  const label = alertLabels[alertType] ?? {
    subject: `Alert: ${alertType}`,
    title: alertType,
    colour: '#92620A',
    bg: '#FFF8E6',
  };

  const ctaBlock = jobUrl
    ? `<a href="${jobUrl}" style="display: inline-block; background: #00A3E0; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 8px;">View jobs</a>`
    : '';

  await getResend().emails.send({
    from: FROM,
    to,
    subject: label.subject,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #D8E2EA; border-radius: 12px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 600; color: #003D5B;">Mysoft <span style="color: #00A3E0;">Integrations</span></span>
        </div>
        <h2 style="color: #1A2B38; font-size: 20px; margin-bottom: 12px;">${label.title}</h2>
        <div style="background: ${label.bg}; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 600; color: ${label.colour}; margin-bottom: 4px;">${label.title}</div>
          <div style="font-size: 13px; color: #1A2B38;">${message}</div>
        </div>
        ${ctaBlock}
        <p style="color: #6B8599; font-size: 12px; margin-top: 24px;">This is an automated alert from the Mysoft Integration Platform. If you believe this alert is in error, please contact support.</p>
      </div>
    `,
  });
}

export async function sendApprovalRequestEmail({
  to, filename, uploadedBy, rowCount, jobUrl, branding,
}: {
  to: string; filename: string; uploadedBy: string; rowCount: number | null; jobUrl: string; branding?: EmailBranding;
}) {
  const platformName = branding?.brand_name ?? 'Mysoft Integration Platform';
  const supportEmail = branding?.support_email ?? 'support@mysoftx3.com';

  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Job awaiting your approval: ${filename}`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #D8E2EA; border-radius: 12px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 600; color: #003D5B;">${platformName}</span>
        </div>
        <h2 style="color: #1A2B38; font-size: 20px; margin-bottom: 12px;">Job awaiting approval</h2>
        <div style="background: #FFF8E6; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 600; color: #92620A; margin-bottom: 4px;">Awaiting Approval</div>
          <div style="font-size: 13px; color: #1A2B38;">${filename}</div>
          <div style="font-size: 12px; color: #6B8599; margin-top: 8px;">
            Uploaded by ${uploadedBy}${rowCount != null ? ` · ${rowCount} row${rowCount !== 1 ? 's' : ''}` : ''}
          </div>
        </div>
        <p style="color: #6B8599; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
          A file has been uploaded and requires your approval before it is submitted to Intacct. Please review the file and approve or reject it.
        </p>
        <a href="${jobUrl}" style="display: inline-block; background: #00A3E0; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">
          Review &amp; Approve
        </a>
        <p style="color: #6B8599; font-size: 12px; margin-top: 24px;">If you need help, contact <a href="mailto:${supportEmail}" style="color: #00A3E0;">${supportEmail}</a>.</p>
      </div>
    `,
  });
}

export async function sendSubscriptionChangedEmail({
  to, tenantName, oldPlanName, newPlanName, effectiveDate, isFreeOfCharge, discountPct, subscriptionUrl,
}: {
  to: string;
  tenantName: string;
  oldPlanName: string | null;
  newPlanName: string;
  effectiveDate: string;
  isFreeOfCharge: boolean;
  discountPct: number;
  subscriptionUrl: string;
}) {
  const pricingNote = isFreeOfCharge
    ? 'This subscription is free of charge.'
    : discountPct > 0
    ? `A ${discountPct}% discount has been applied.`
    : '';

  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Subscription updated: ${tenantName}`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #D8E2EA; border-radius: 12px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 600; color: #003D5B;">Mysoft <span style="color: #00A3E0;">Integrations</span></span>
        </div>
        <h2 style="color: #1A2B38; font-size: 20px; margin-bottom: 12px;">Subscription updated</h2>
        <div style="background: #EBF5FF; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="font-size: 12px; color: #6B8599; margin-bottom: 4px;">Tenant</div>
          <div style="font-size: 14px; font-weight: 600; color: #1A2B38; margin-bottom: 12px;">${tenantName}</div>
          ${oldPlanName ? `<div style="font-size: 12px; color: #6B8599;">Previous plan: <span style="color: #1A2B38;">${oldPlanName}</span></div>` : ''}
          <div style="font-size: 12px; color: #6B8599; margin-top: 4px;">New plan: <span style="font-weight: 600; color: #00A3E0;">${newPlanName}</span></div>
          <div style="font-size: 12px; color: #6B8599; margin-top: 4px;">Effective: ${effectiveDate}</div>
          ${pricingNote ? `<div style="font-size: 12px; color: #6B8599; margin-top: 4px;">${pricingNote}</div>` : ''}
        </div>
        <a href="${subscriptionUrl}" style="display: inline-block; background: #00A3E0; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">
          View subscription
        </a>
        <p style="color: #6B8599; font-size: 12px; margin-top: 24px;">This notification was sent to the account team and tenant administrators.</p>
      </div>
    `,
  });
}

export async function sendSubscriptionCancelledEmail({
  to, tenantName, planName, cancellationDate, subscriptionUrl,
}: {
  to: string;
  tenantName: string;
  planName: string;
  cancellationDate: string;
  subscriptionUrl: string;
}) {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Subscription cancelled: ${tenantName}`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #D8E2EA; border-radius: 12px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 600; color: #003D5B;">Mysoft <span style="color: #00A3E0;">Integrations</span></span>
        </div>
        <h2 style="color: #1A2B38; font-size: 20px; margin-bottom: 12px;">Subscription cancelled</h2>
        <div style="background: #FDE8E6; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="font-size: 12px; color: #6B8599; margin-bottom: 4px;">Tenant</div>
          <div style="font-size: 14px; font-weight: 600; color: #1A2B38; margin-bottom: 12px;">${tenantName}</div>
          <div style="font-size: 12px; color: #6B8599;">Plan: <span style="color: #1A2B38;">${planName}</span></div>
          <div style="font-size: 12px; color: #6B8599; margin-top: 4px;">Last active date: <span style="color: #9B2B1E; font-weight: 600;">${cancellationDate}</span></div>
        </div>
        <a href="${subscriptionUrl}" style="display: inline-block; background: #00A3E0; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">
          View subscription
        </a>
        <p style="color: #6B8599; font-size: 12px; margin-top: 24px;">This notification was sent to the account team and tenant administrators.</p>
      </div>
    `,
  });
}

export async function sendInviteEmail({
  to,
  token,
  inviterEmail,
  baseUrl,
}: {
  to: string;
  token: string;
  inviterEmail: string;
  baseUrl: string;
}) {
  const inviteUrl = `${baseUrl}/invite/${token}`;

  await getResend().emails.send({
    from: FROM,
    to,
    subject: 'You have been invited to Mysoft Integration Platform',
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #D8E2EA; border-radius: 12px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 600; color: #003D5B;">Mysoft <span style="color: #00A3E0;">Integrations</span></span>
        </div>
        <h2 style="color: #1A2B38; font-size: 20px; margin-bottom: 12px;">You've been invited</h2>
        <p style="color: #6B8599; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
          <strong>${inviterEmail}</strong> has invited you to join the Mysoft Integration Platform.
          Click the button below to set your password and get started.
        </p>
        <a href="${inviteUrl}" style="display: inline-block; background: #00A3E0; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-bottom: 24px;">
          Accept invitation
        </a>
        <p style="color: #6B8599; font-size: 12px; margin-top: 16px;">
          This link expires in 7 days. If you did not expect this invitation, you can safely ignore this email.
        </p>
        <p style="color: #D8E2EA; font-size: 11px; margin-top: 24px;">
          Or copy this URL: ${inviteUrl}
        </p>
      </div>
    `,
  });
}

/**
 * Sent when a tenant's trial period has expired and the account has been suspended.
 * Prompts the tenant admin to contact Mysoft to convert to a paid plan.
 */
export async function sendTrialExpiredEmail({
  to,
  tenantName,
  branding,
}: {
  to: string;
  tenantName: string;
  branding?: EmailBranding;
}) {
  const platformName = branding?.brand_name ?? 'Mysoft Integration Platform';
  const supportEmail = branding?.support_email ?? 'support@mysoftx3.com';

  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Your ${platformName} trial has ended`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #D8E2EA; border-radius: 12px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 600; color: #003D5B;">${platformName}</span>
        </div>
        <h2 style="color: #1A2B38; font-size: 20px; margin-bottom: 12px;">Your trial has ended</h2>
        <p style="color: #6B8599; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
          The trial period for <strong>${tenantName}</strong> has expired and your account has been suspended.
          Your data is retained for 90 days.
        </p>
        <p style="color: #6B8599; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
          To reactivate your account and continue using ${platformName}, please contact us to arrange a subscription.
        </p>
        <a href="mailto:${supportEmail}?subject=Trial conversion - ${encodeURIComponent(tenantName)}" style="display: inline-block; background: #00A3E0; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-bottom: 24px;">
          Contact us to upgrade
        </a>
        <p style="color: #6B8599; font-size: 12px; margin-top: 24px;">
          Questions? Email <a href="mailto:${supportEmail}" style="color: #00A3E0;">${supportEmail}</a>.
        </p>
      </div>
    `,
  });
}
