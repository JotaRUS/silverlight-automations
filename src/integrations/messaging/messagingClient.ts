import type { Channel } from '../../config/channels';
import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import { ProviderCredentialResolver } from '../../core/providers/providerCredentialResolver';
import type { ProviderType } from '../../core/providers/providerTypes';
import { clock } from '../../core/time/clock';
import { prisma } from '../../db/client';
import { EmailClient } from './emailClient';
import { logger } from '../../core/logging/logger';

export interface SendMessageInput {
  projectId: string;
  channel: Channel;
  recipient: string;
  body: string;
  correlationId: string;
}

interface ChannelProviderConfig {
  endpoint: string;
  providerType: ProviderType;
  apiKeyHeader?: string;
  isBasicAuth?: boolean;
  contentType?: string;
  useSmtp?: boolean;
  endpointBuilder?: (credentials: Record<string, unknown>) => string;
  headerBuilder?: (credentials: Record<string, unknown>) => Record<string, string>;
  bodyBuilder?: (recipient: string, text: string, credentials: Record<string, unknown>) => unknown;
}

function credentialString(credentials: Record<string, unknown>, key: string): string {
  const value = credentials[key];
  return typeof value === 'string' ? value : '';
}

function providerStatusCode(error: unknown): number | undefined {
  if (
    !(error instanceof AppError) ||
    typeof error.details !== 'object' ||
    error.details === null ||
    !('statusCode' in error.details)
  ) {
    return undefined;
  }

  const statusCode = (error.details as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
}

const channelProviderConfigs: Partial<Record<Channel, ChannelProviderConfig>> = {
  email: {
    providerType: 'EMAIL_PROVIDER',
    endpoint: 'smtp',
    useSmtp: true
  },
  linkedin: {
    providerType: 'SALES_NAV_WEBHOOK',
    endpoint: 'https://api.linkedin.com/v2/messages',
    apiKeyHeader: 'authorization',
    bodyBuilder: (recipient, text) => {
      // LinkedIn Messages API requires Person URNs (urn:li:person:xxxxx)
      const personUrn =
        recipient.startsWith('urn:li:person:')
          ? recipient
          : recipient.includes('://')
            ? recipient
            : `urn:li:person:${recipient}`;
      return {
        recipients: [personUrn],
        body: text,
        messageType: 'MEMBER_TO_MEMBER'
      };
    }
  },
  whatsapp: {
    providerType: 'WHATSAPP_2CHAT',
    endpoint: 'https://api.p.2chat.io/open/whatsapp/send-message',
    apiKeyHeader: 'X-User-API-Key',
    bodyBuilder: (recipient, text, credentials) => ({
      from_number: credentialString(credentials, 'fromNumber'),
      to_number: recipient,
      text
    })
  },
  respondio: {
    providerType: 'RESPONDIO',
    endpoint: 'https://api.respond.io/v2/contact/send-message',
    apiKeyHeader: 'authorization',
    bodyBuilder: (recipient, text) => ({
      contactId: recipient,
      message: { type: 'text', text }
    })
  },
  sms: {
    providerType: 'TWILIO',
    endpoint: '',
    endpointBuilder: (credentials) =>
      `https://api.twilio.com/2010-04-01/Accounts/${credentialString(credentials, 'accountSid')}/Messages.json`,
    isBasicAuth: true,
    contentType: 'application/x-www-form-urlencoded',
    bodyBuilder: (recipient, text, credentials) => ({
      To: recipient,
      From: credentialString(credentials, 'fromNumber'),
      Body: text
    })
  },
  imessage: {
    providerType: 'TWILIO',
    endpoint: '',
    endpointBuilder: (credentials) =>
      `https://api.twilio.com/2010-04-01/Accounts/${credentialString(credentials, 'accountSid')}/Messages.json`,
    isBasicAuth: true,
    contentType: 'application/x-www-form-urlencoded',
    bodyBuilder: (recipient, text, credentials) => ({
      To: recipient,
      From: credentialString(credentials, 'fromNumber'),
      Body: text
    })
  },
  line: {
    providerType: 'LINE',
    endpoint: 'https://api.line.me/v2/bot/message/push',
    apiKeyHeader: 'authorization',
    bodyBuilder: (recipient, text) => ({
      to: recipient,
      messages: [{ type: 'text', text }]
    })
  },
  wechat: {
    providerType: 'WECHAT',
    endpoint: '',
    endpointBuilder: (credentials) =>
      `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${encodeURIComponent(credentialString(credentials, 'apiKey'))}`,
    headerBuilder: () => ({}),
    bodyBuilder: (recipient, text) => ({
      touser: recipient,
      msgtype: 'text',
      text: { content: text }
    })
  },
  viber: {
    providerType: 'VIBER',
    endpoint: 'https://chatapi.viber.com/pa/send_message',
    apiKeyHeader: 'x-viber-auth-token',
    bodyBuilder: (recipient, text, credentials) => ({
      receiver: recipient,
      type: 'text',
      text,
      sender: {
        name: credentialString(credentials, 'senderName') || 'Expert Network'
      }
    })
  },
  telegram: {
    providerType: 'TELEGRAM',
    endpoint: '',
    endpointBuilder: (credentials) =>
      `https://api.telegram.org/bot${credentialString(credentials, 'botToken')}/sendMessage`,
    bodyBuilder: (recipient, text) => ({
      chat_id: recipient,
      text
    })
  },
  kakaotalk: {
    providerType: 'KAKAOTALK',
    endpoint: 'https://kapi.kakao.com/v1/api/talk/friends/message/default/send',
    apiKeyHeader: 'authorization',
    contentType: 'application/x-www-form-urlencoded',
    bodyBuilder: (recipient, text) => ({
      receiver_uuids: JSON.stringify([recipient]),
      template_object: JSON.stringify({
        object_type: 'text',
        text,
        link: {}
      })
    })
  },
  voicemail: {
    providerType: 'VOICEMAIL_DROP',
    endpoint: '',
    isBasicAuth: true,
    contentType: 'application/x-www-form-urlencoded',
    endpointBuilder: (credentials) =>
      `https://api.twilio.com/2010-04-01/Accounts/${credentialString(credentials, 'accountSid')}/Calls.json`,
    bodyBuilder: (recipient, text, credentials) => ({
      To: recipient,
      From: credentialString(credentials, 'fromNumber'),
      Twiml: `<Response><Say voice="alice">${text}</Say></Response>`
    })
  },
  phone: {
    providerType: 'YAY',
    endpoint: 'https://api.yay.com/v1/calls',
    apiKeyHeader: 'authorization',
    bodyBuilder: (recipient, _text, credentials) => ({
      to: recipient,
      from: credentialString(credentials, 'fromNumber'),
      type: 'outbound'
    })
  }
};

export class MessagingClient {
  private readonly providerCredentialResolver: ProviderCredentialResolver;
  private readonly emailClient: EmailClient;

  public constructor(providerCredentialResolver?: ProviderCredentialResolver) {
    this.providerCredentialResolver = providerCredentialResolver ?? new ProviderCredentialResolver(prisma);
    this.emailClient = new EmailClient();
  }

  private extractProviderMessageId(response: { id?: string; messageId?: string; data?: { id?: string; messageId?: string } }, fallbackPrefix: string): string {
    return (
      response.id ??
      response.messageId ??
      response.data?.id ??
      response.data?.messageId ??
      `${fallbackPrefix}-${String(clock.now().getTime())}`
    );
  }

  public async sendMessage(input: SendMessageInput): Promise<{ providerMessageId: string }> {
    const providerConfig = channelProviderConfigs[input.channel];
    if (!providerConfig) {
      throw new AppError('Messaging provider key missing', 500, 'messaging_provider_key_missing', {
        channel: input.channel
      });
    }

    const resolvedCredentials = await this.providerCredentialResolver.resolve({
      providerType: providerConfig.providerType,
      projectId: input.projectId,
      correlationId: input.correlationId,
      fallbackStrategy: 'round_robin'
    });

    if (providerConfig.useSmtp) {
      return this.sendViaSmtp(input, resolvedCredentials);
    }

    let linkedInBearerToken: string | undefined;
    if (input.channel === 'linkedin') {
      const oauthToken = credentialString(resolvedCredentials.credentials, 'oauthAccessToken');
      if (oauthToken) {
        const expiresAt = credentialString(resolvedCredentials.credentials, 'oauthAccessTokenExpiresAt');
        const isExpired = expiresAt && new Date(expiresAt).getTime() <= Date.now();
        if (!isExpired) {
          linkedInBearerToken = oauthToken;
        } else {
          logger.warn(
            { channel: input.channel, correlationId: input.correlationId },
            'linkedin-oauth-token-expired-for-messaging'
          );
        }
      }
    }

    const endpoint = providerConfig.endpointBuilder
      ? providerConfig.endpointBuilder(resolvedCredentials.credentials)
      : providerConfig.endpoint;
    const headers: Record<string, string> = providerConfig.headerBuilder
      ? providerConfig.headerBuilder(resolvedCredentials.credentials)
      : {};

    if (providerConfig.isBasicAuth) {
      const accountSid = credentialString(resolvedCredentials.credentials, 'accountSid');
      const authToken = credentialString(resolvedCredentials.credentials, 'authToken');
      headers.authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
    } else if (!providerConfig.headerBuilder) {
      const credentialValue =
        linkedInBearerToken ??
        (providerConfig.providerType === 'TELEGRAM'
          ? credentialString(resolvedCredentials.credentials, 'botToken')
          : credentialString(resolvedCredentials.credentials, 'apiKey'));
      if (credentialValue) {
        const headerName = providerConfig.apiKeyHeader ?? 'authorization';
        if (headerName === 'authorization') {
          headers.authorization = `Bearer ${credentialValue}`;
        } else {
          headers[headerName] = credentialValue;
        }
      }
    }

    if (!endpoint) {
      throw new AppError('Messaging provider endpoint missing', 500, 'messaging_provider_endpoint_missing', {
        channel: input.channel,
        providerType: providerConfig.providerType
      });
    }

    const body = providerConfig.bodyBuilder
      ? providerConfig.bodyBuilder(input.recipient, input.body, resolvedCredentials.credentials)
      : { recipient: input.recipient, text: input.body };

    const sendProviderRequest = async (
      requestHeaders: Record<string, string>
    ): Promise<{ id?: string; messageId?: string }> =>
      requestJson<{ id?: string; messageId?: string }>({
        method: 'POST',
        url: endpoint,
        headers: requestHeaders,
        body,
        contentType: providerConfig.contentType,
        provider: `messaging:${input.channel}`,
        operation: 'send-message',
        correlationId: input.correlationId
      });

    const markProviderFailure = async (error: unknown): Promise<void> => {
      const details = error instanceof AppError && typeof error.details === 'object' && error.details !== null
        ? error.details as { responseBody?: unknown }
        : {};
      await this.providerCredentialResolver.markFailure({
        providerAccountId: resolvedCredentials.providerAccountId,
        providerType: providerConfig.providerType,
        reason: error instanceof Error ? error.message : 'unknown messaging provider error',
        statusCode: providerStatusCode(error),
        responseBody: details.responseBody
      });
    };

    let response: { id?: string; messageId?: string };
    try {
      response = await sendProviderRequest(headers);
    } catch (error) {
      await markProviderFailure(error);
      throw error;
    }

    const providerMessageId = this.extractProviderMessageId(response, input.channel);
    return {
      providerMessageId
    };
  }

  private async sendViaSmtp(
    input: SendMessageInput,
    resolvedCredentials: { providerAccountId: string; credentials: Record<string, unknown> }
  ): Promise<{ providerMessageId: string }> {
    const fromAddress = typeof resolvedCredentials.credentials.from === 'string'
      ? resolvedCredentials.credentials.from
      : typeof resolvedCredentials.credentials.user === 'string'
        ? resolvedCredentials.credentials.user
        : '';

    try {
      return await this.emailClient.sendEmail(resolvedCredentials.credentials, {
        to: input.recipient,
        from: fromAddress,
        subject: 'Expert Network Invitation',
        textBody: input.body,
        correlationId: input.correlationId
      });
    } catch (error) {
      await this.providerCredentialResolver.markFailure({
        providerAccountId: resolvedCredentials.providerAccountId,
        providerType: 'EMAIL_PROVIDER',
        reason: error instanceof Error ? error.message : 'unknown email error'
      });
      throw error;
    }
  }
}
