import type { Channel } from '../../config/channels';
import { env } from '../../config/env';
import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import { clock } from '../../core/time/clock';

export interface SendMessageInput {
  channel: Channel;
  recipient: string;
  body: string;
  correlationId: string;
}

interface ChannelProviderConfig {
  endpoint: string;
  apiKey?: string;
  apiKeyHeader?: string;
}

const channelProviderConfigs: Partial<Record<Channel, ChannelProviderConfig>> = {
  email: {
    endpoint: 'https://api.email-provider.example/v1/send',
    apiKey: env.EMAIL_PROVIDER_API_KEY,
    apiKeyHeader: 'authorization'
  },
  linkedin: {
    endpoint: 'https://api.linkedin.com/v2/messages',
    apiKey: env.LINKEDIN_API_KEY,
    apiKeyHeader: 'authorization'
  },
  whatsapp: {
    endpoint: 'https://api.2chat.co/v1/messages',
    apiKey: env.WHATSAPP_2CHAT_API_KEY,
    apiKeyHeader: 'x-api-key'
  },
  respondio: {
    endpoint: 'https://api.respond.io/v2/message',
    apiKey: env.RESPONDIO_API_KEY,
    apiKeyHeader: 'authorization'
  },
  sms: {
    endpoint: 'https://api.twilio.com/2010-04-01/Accounts/messages.json',
    apiKey: env.TWILIO_API_KEY,
    apiKeyHeader: 'authorization'
  },
  imessage: {
    endpoint: 'https://api.twilio.com/2010-04-01/Accounts/messages.json',
    apiKey: env.TWILIO_API_KEY,
    apiKeyHeader: 'authorization'
  },
  line: {
    endpoint: 'https://api.line.me/v2/bot/message/push',
    apiKey: env.LINE_API_KEY,
    apiKeyHeader: 'authorization'
  },
  wechat: {
    endpoint: 'https://api.wechat.com/v1/message/send',
    apiKey: env.WECHAT_API_KEY,
    apiKeyHeader: 'authorization'
  },
  viber: {
    endpoint: 'https://chatapi.viber.com/pa/send_message',
    apiKey: env.VIBER_API_KEY,
    apiKeyHeader: 'x-viber-auth-token'
  },
  telegram: {
    endpoint: `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN ?? ''}/sendMessage`,
    apiKey: env.TELEGRAM_BOT_TOKEN,
    apiKeyHeader: 'authorization'
  },
  kakaotalk: {
    endpoint: 'https://kapi.kakao.com/v2/api/talk/memo/default/send',
    apiKey: env.KAKAOTALK_API_KEY,
    apiKeyHeader: 'authorization'
  },
  voicemail: {
    endpoint: 'https://api.voicemail-drop.example/v1/drop',
    apiKey: env.VOICEMAIL_DROP_API_KEY,
    apiKeyHeader: 'x-api-key'
  },
  phone: {
    endpoint: 'https://api.yay.com/v1/calls',
    apiKey: env.YAY_API_KEY,
    apiKeyHeader: 'authorization'
  }
};

export class MessagingClient {
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
    if (!providerConfig?.apiKey) {
      throw new AppError('Messaging provider key missing', 500, 'messaging_provider_key_missing', {
        channel: input.channel
      });
    }

    const headerName = providerConfig.apiKeyHeader ?? 'authorization';
    const headers: Record<string, string> = {};
    if (headerName === 'authorization') {
      headers.authorization = `Bearer ${providerConfig.apiKey}`;
    } else {
      headers[headerName] = providerConfig.apiKey;
    }

    const response = await requestJson<{ id?: string; messageId?: string }>({
      method: 'POST',
      url: providerConfig.endpoint,
      headers,
      body: {
        recipient: input.recipient,
        text: input.body
      },
      provider: `messaging:${input.channel}`,
      operation: 'send-message',
      correlationId: input.correlationId
    });

    const providerMessageId = this.extractProviderMessageId(response, input.channel);
    return {
      providerMessageId
    };
  }
}
