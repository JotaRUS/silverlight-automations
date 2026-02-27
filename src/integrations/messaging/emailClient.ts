import { createTransport, type Transporter } from 'nodemailer';

import { AppError } from '../../core/errors/appError';
import { logger } from '../../core/logging/logger';
import { clock } from '../../core/time/clock';

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  correlationId: string;
}

export interface SendEmailResult {
  providerMessageId: string;
}

export class EmailClient {
  private transporter: Transporter | null = null;

  private getOrCreateTransporter(credentials: Record<string, unknown>): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = typeof credentials.host === 'string' ? credentials.host : '';
    const port = typeof credentials.port === 'number' ? credentials.port : 587;
    const user = typeof credentials.user === 'string' ? credentials.user : '';
    const pass = typeof credentials.pass === 'string' ? credentials.pass : '';

    if (!host || !user || !pass) {
      throw new AppError('Email SMTP credentials incomplete', 500, 'email_credentials_incomplete', {
        hasHost: Boolean(host),
        hasUser: Boolean(user),
        hasPass: Boolean(pass)
      });
    }

    this.transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    return this.transporter;
  }

  public async sendEmail(
    credentials: Record<string, unknown>,
    input: SendEmailInput
  ): Promise<SendEmailResult> {
    const transporter = this.getOrCreateTransporter(credentials);

    try {
      const info = await transporter.sendMail({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.textBody,
        html: input.htmlBody
      });

      const messageId = typeof info.messageId === 'string'
        ? info.messageId
        : `email-${String(clock.now().getTime())}`;

      logger.info(
        { messageId, to: input.to, correlationId: input.correlationId },
        'email-sent'
      );

      return { providerMessageId: messageId };
    } catch (error) {
      logger.error(
        { err: error, to: input.to, correlationId: input.correlationId },
        'email-send-failed'
      );
      throw new AppError(
        'Failed to send email via SMTP',
        502,
        'email_send_failed',
        { originalError: error instanceof Error ? error.message : 'unknown' }
      );
    }
  }
}
