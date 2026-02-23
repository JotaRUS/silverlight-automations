import type { Channel } from '../../config/channels';
import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import { ProviderCredentialResolver } from '../../core/providers/providerCredentialResolver';
import type { ProviderType } from '../../core/providers/providerTypes';
import { clock } from '../../core/time/clock';
import { prisma } from '../../db/client';

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
  endpointBuilder?: (credentials: Record<string, unknown>) => string;
  headerBuilder?: (credentials: Record<string, unknown>) => Record<string, string>;
}

function credentialString(credentials: Record<string, unknown>, key: string): string {
  const value = credentials[key];
  return typeof value === 'string' ? value : '';
}

const channelProviderConfigs: Partial<Record<Channel, ChannelProviderConfig>> = {
  email: {
    providerType: 'EMAIL_PROVIDER',
    endpoint: 'https://api.email-provider.example/v1/send',
    apiKeyHeader: 'authorization'
  },
  linkedin: {
    providerType: 'LINKEDIN',
    endpoint: 'https://api.linkedin.com/v2/messages',
    apiKeyHeader: 'authorization'
  },
  whatsapp: {
    providerType: 'WHATSAPP_2CHAT',
    endpoint: 'https://api.2chat.co/v1/messages',
    apiKeyHeader: 'x-api-key'
  },
  respondio: {
    providerType: 'RESPONDIO',
    endpoint: 'https://api.respond.io/v2/message',
    apiKeyHeader: 'authorization'
  },
  sms: {
    providerType: 'TWILIO',
    endpoint: '',
    endpointBuilder: (credentials) =>
      `https://api.twilio.com/2010-04-01/Accounts/${credentialString(credentials, 'accountSid')}/Messages.json`,
    isBasicAuth: true
  },
  imessage: {
    providerType: 'TWILIO',
    endpoint: '',
    endpointBuilder: (credentials) =>
      `https://api.twilio.com/2010-04-01/Accounts/${credentialString(credentials, 'accountSid')}/Messages.json`,
    isBasicAuth: true
  },
  line: {
    providerType: 'LINE',
    endpoint: 'https://api.line.me/v2/bot/message/push',
    apiKeyHeader: 'authorization'
  },
  wechat: {
    providerType: 'WECHAT',
    endpoint: 'https://api.wechat.com/v1/message/send',
    apiKeyHeader: 'authorization'
  },
  viber: {
    providerType: 'VIBER',
    endpoint: 'https://chatapi.viber.com/pa/send_message',
    apiKeyHeader: 'x-viber-auth-token'
  },
  telegram: {
    providerType: 'TELEGRAM',
    endpoint: '',
    endpointBuilder: (credentials) =>
      `https://api.telegram.org/bot${credentialString(credentials, 'botToken')}/sendMessage`
  },
  kakaotalk: {
    providerType: 'KAKAOTALK',
    endpoint: 'https://kapi.kakao.com/v2/api/talk/memo/default/send',
    apiKeyHeader: 'authorization'
  },
  voicemail: {
    providerType: 'VOICEMAIL_DROP',
    endpoint: 'https://api.voicemail-drop.example/v1/drop',
    apiKeyHeader: 'x-api-key'
  },
  phone: {
    providerType: 'YAY',
    endpoint: 'https://api.yay.com/v1/calls',
    apiKeyHeader: 'authorization'
  }
};

export class MessagingClient {
  private readonly providerCredentialResolver: ProviderCredentialResolver;

  public constructor(providerCredentialResolver?: ProviderCredentialResolver) {
    this.providerCredentialResolver = providerCredentialResolver ?? new ProviderCredentialResolver(prisma);
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
        providerConfig.providerType === 'TELEGRAM'
          ? credentialString(resolvedCredentials.credentials, 'botToken')
          : credentialString(resolvedCredentials.credentials, 'apiKey');
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

    let response: { id?: string; messageId?: string };
    try {
      response = await requestJson<{ id?: string; messageId?: string }>({
        method: 'POST',
        url: endpoint,
        headers,
        body: {
          recipient: input.recipient,
          text: input.body
        },
        provider: `messaging:${input.channel}`,
        operation: 'send-message',
        correlationId: input.correlationId
      });
    } catch (error) {
      await this.providerCredentialResolver.markFailure({
        providerAccountId: resolvedCredentials.providerAccountId,
        providerType: providerConfig.providerType,
        reason: error instanceof Error ? error.message : 'unknown messaging provider error',
        statusCode:
          error instanceof AppError &&
          typeof error.details === 'object' &&
          error.details !== null &&
          'statusCode' in error.details &&
          typeof (error.details as { statusCode?: unknown }).statusCode === 'number'
            ? ((error.details as { statusCode: number }).statusCode)
            : undefined
      });
      throw error;
    }

    const providerMessageId = this.extractProviderMessageId(response, input.channel);
    return {
      providerMessageId
    };
  }
}
