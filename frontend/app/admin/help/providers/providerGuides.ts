import type { ProviderType } from '@/types/provider';

type ProviderCategory =
  | 'Lead Sourcing'
  | 'Data Enrichment'
  | 'Outreach & Messaging'
  | 'Calling & Operations'
  | 'Data Sync';

interface ProviderCredentialRequirement {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

interface ProviderLink {
  label: string;
  url: string;
}

interface TroubleshootingItem {
  issue: string;
  resolution: string;
}

interface WebhookConfiguration {
  endpointTemplate: string;
  method: 'POST' | 'GET';
  expectedHeaders: string[];
  notes: string[];
}

export interface ProviderGuideDoc {
  slug: string;
  providerType: ProviderType;
  name: string;
  category: ProviderCategory;
  summary: string;
  credentials: ProviderCredentialRequirement[];
  prerequisites: string[];
  credentialSteps: string[];
  platformConfiguration: string[];
  webhookConfiguration?: WebhookConfiguration;
  validationChecklist: string[];
  commonPitfalls: TroubleshootingItem[];
  officialLinks: ProviderLink[];
  lastReviewed: string;
}

const sharedPlatformSteps = [
  'Open Admin → Providers.',
  'Select the provider type and set an account label (for example "Production" or "Team A").',
  'Paste credentials and click "Create Provider Account".',
  'Run "Test Connection" from the provider card.',
  'Bind the provider to one or more projects from the Providers page or from the project wizard.'
];

export const providerGuideDocs: ProviderGuideDoc[] = [
  {
    slug: 'apollo',
    providerType: 'APOLLO',
    name: 'Apollo',
    category: 'Lead Sourcing',
    summary: 'Lead sourcing and job-title discovery provider using an Apollo API key.',
    credentials: [
      {
        key: 'apiKey',
        label: 'API Key',
        required: true,
        description: 'Apollo API key created in Settings → Integrations → API Keys.'
      }
    ],
    prerequisites: [
      'Apollo account with API access enabled on your pricing plan.',
      'Admin access in Apollo to create or rotate API keys.'
    ],
    credentialSteps: [
      'Sign in to Apollo and open Settings → Integrations.',
      'Go to API Keys and click "Create new key".',
      'Set key name and endpoint permissions (or set as master key when needed).',
      'Copy the key immediately and store it in a secrets manager.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: [
      'Provider card shows healthy after Test Connection.',
      'Lead sourcing jobs start for projects bound to this account.'
    ],
    commonPitfalls: [
      {
        issue: '401 or unauthorized during test.',
        resolution: 'Regenerate key in Apollo and ensure API access is enabled for your subscription.'
      },
      {
        issue: 'Partial endpoint failures.',
        resolution: 'Check Apollo key scopes; some endpoints require broader or master-key permissions.'
      }
    ],
    officialLinks: [
      { label: 'Apollo Create API Key', url: 'https://docs.apollo.io/docs/create-api-key' },
      { label: 'Apollo API Reference', url: 'https://docs.apollo.io/reference' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'sales-navigator',
    providerType: 'SALES_NAV_WEBHOOK',
    name: 'LinkedIn Sales Navigator',
    category: 'Lead Sourcing',
    summary: 'LinkedIn Sales Navigator ingestion using OAuth client credentials and webhook delivery.',
    credentials: [
      {
        key: 'clientId',
        label: 'Client ID',
        required: true,
        description: 'LinkedIn Developer application Client ID from the Auth tab.'
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        required: true,
        description: 'LinkedIn Developer application Client Secret from the Auth tab.'
      }
    ],
    prerequisites: [
      'LinkedIn Developer app with Sales Navigator/partner access approved.',
      'Ability to configure outbound webhooks from your Sales Navigator data source.'
    ],
    credentialSteps: [
      'Open LinkedIn Developer Portal (My Apps) and create/select your app.',
      'Open Auth tab and copy Client ID + Client Secret.',
      'Test OAuth token exchange against https://www.linkedin.com/oauth/v2/accessToken using grant_type=client_credentials.',
      'Store both values in this provider account.'
    ],
    platformConfiguration: [
      ...sharedPlatformSteps,
      'Configure your upstream Sales Navigator webhook sender to POST JSON payloads to /webhooks/sales-nav/{providerAccountId}.',
      'Payload must include projectId, sourceUrl, normalizedUrl, and leads array in the expected schema.'
    ],
    webhookConfiguration: {
      endpointTemplate: 'https://<your-api-host>/webhooks/sales-nav/{providerAccountId}',
      method: 'POST',
      expectedHeaders: ['Authorization: Bearer <token> OR x-sales-nav-client-id: <client-id>'],
      notes: [
        'This platform accepts either a bearer auth header or x-sales-nav-client-id validation.',
        'Use the provider account UUID in the webhook path; route rejects wrong provider type or inactive account.',
        'Token exchange health check uses LinkedIn client credentials flow.'
      ]
    },
    validationChecklist: [
      'Test Connection succeeds (OAuth token exchange works).',
      'Webhook call returns HTTP 202 accepted with valid payload.'
    ],
    commonPitfalls: [
      {
        issue: '401 from webhook endpoint.',
        resolution: 'Verify client ID in x-sales-nav-client-id or provide valid Bearer auth header.'
      },
      {
        issue: 'Health check fails despite valid app.',
        resolution: 'Confirm LinkedIn app has proper partner permissions and client credentials are current.'
      }
    ],
    officialLinks: [
      { label: 'LinkedIn Developer Apps', url: 'https://www.linkedin.com/developers/apps' },
      { label: 'LinkedIn Client Credentials Flow', url: 'https://learn.microsoft.com/en-us/linkedin/shared/authentication/client-credentials-flow' },
      { label: 'LinkedIn FAQ (Client ID Location)', url: 'https://developer.linkedin.com/support/faq' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'leadmagic',
    providerType: 'LEADMAGIC',
    name: 'LeadMagic',
    category: 'Data Enrichment',
    summary: 'Email and phone enrichment using a LeadMagic API key.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'LeadMagic API key from account profile/API settings.' }
    ],
    prerequisites: ['LeadMagic account with active credits.'],
    credentialSteps: [
      'Sign in to LeadMagic.',
      'Open account profile or API settings page.',
      'Copy the API key used in X-API-Key authentication.',
      'Rotate key immediately if it was exposed.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: [
      'Provider health check returns healthy.',
      'Enrichment attempts start producing contacts for newly ingested leads.'
    ],
    commonPitfalls: [
      { issue: 'Unexpected 403/401.', resolution: 'Ensure the copied key is current and not revoked in LeadMagic.' },
      { issue: 'No enrichment output.', resolution: 'Check remaining credits and provider-side rate limits.' }
    ],
    officialLinks: [
      { label: 'LeadMagic Authentication', url: 'https://leadmagic.io/docs/authentication' },
      { label: 'LeadMagic API Calls', url: 'https://leadmagic.io/docs/making-api-calls' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'prospeo',
    providerType: 'PROSPEO',
    name: 'Prospeo',
    category: 'Data Enrichment',
    summary: 'Person/contact enrichment via Prospeo API key (X-KEY header).',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'Prospeo API key from the app dashboard.' }
    ],
    prerequisites: ['Prospeo account with API access.'],
    credentialSteps: [
      'Sign in at app.prospeo.io.',
      'Open API/Integrations area and copy or create an API key.',
      'Use the key as X-KEY in Prospeo requests.',
      'Keep separate keys for environments when possible.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: [
      'Test Connection is healthy.',
      'Prospeo enrichments move leads from ENRICHING to ENRICHED when data exists.'
    ],
    commonPitfalls: [
      { issue: 'Key works in dashboard but not here.', resolution: 'Paste full key with no trailing spaces; Prospeo header must be exact.' },
      { issue: 'Rate limit hits during campaigns.', resolution: 'Use provider fallback ordering and monitor per-minute request ceilings.' }
    ],
    officialLinks: [
      { label: 'Prospeo API Auth', url: 'https://prospeo.io/api-docs/authentication' },
      { label: 'Prospeo API Dashboard', url: 'https://app.prospeo.io/api' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'exa',
    providerType: 'EXA',
    name: 'Exa',
    category: 'Data Enrichment',
    summary: 'Exa API integration for AI-assisted enrichment and research flows.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'API key created in Exa dashboard.' }
    ],
    prerequisites: ['Exa account and team access.'],
    credentialSteps: [
      'Open dashboard.exa.ai and sign in.',
      'Navigate to API Keys and create a key.',
      'Optionally set key name and request limits per key.',
      'Copy key once and store securely.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: [
      'Provider health check succeeds.',
      'No authorization errors in enrichment jobs.'
    ],
    commonPitfalls: [
      { issue: 'Lost key after closing modal.', resolution: 'Generate a new key; Exa may not re-show secret values.' },
      { issue: 'Unexpected throttling.', resolution: 'Review key-level rate limit settings in Exa dashboard.' }
    ],
    officialLinks: [
      { label: 'Exa Quickstart', url: 'https://exa.ai/docs/reference/quickstart' },
      { label: 'Exa Create API Key', url: 'https://exa.ai/docs/reference/team-management/create-api-key' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'rocketreach',
    providerType: 'ROCKETREACH',
    name: 'RocketReach',
    category: 'Data Enrichment',
    summary: 'Professional contact lookup and enrichment using RocketReach API key.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'Generated in RocketReach account settings.' }
    ],
    prerequisites: ['RocketReach API-enabled account.'],
    credentialSteps: [
      'Open rocketreach.co/account.',
      'Find API section and click "Generate New API Key".',
      'Copy the generated key.',
      'Note that generating a new key can invalidate the previous active key.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: [
      'Health check passes after key update.',
      'Contact lookup calls no longer return auth failures.'
    ],
    commonPitfalls: [
      { issue: 'Old key suddenly stops working.', resolution: 'RocketReach key rotation can invalidate previous keys; update all environments.' },
      { issue: 'Low match rates.', resolution: 'Verify input quality (name/company/domain) and available credits.' }
    ],
    officialLinks: [
      { label: 'RocketReach API Account', url: 'https://docs.rocketreach.co/reference/rocketreach-api-account' },
      { label: 'RocketReach FAQ', url: 'https://docs.rocketreach.co/reference/faq' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'wiza',
    providerType: 'WIZA',
    name: 'Wiza',
    category: 'Data Enrichment',
    summary: 'LinkedIn-based enrichment provider with API access enabled by Wiza support.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'Generated from Wiza Settings → API after access is enabled.' }
    ],
    prerequisites: [
      'Paid Wiza plan with API entitlement.',
      'API access enabled by Wiza support on your workspace.'
    ],
    credentialSteps: [
      'Contact Wiza support to enable API for your account.',
      'Open Settings from profile menu and select API.',
      'Select API User context and click Generate.',
      'Copy key and store in your secrets manager.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: [
      'Provider card reports healthy.',
      'Wiza enrichment jobs return data for valid LinkedIn inputs.'
    ],
    commonPitfalls: [
      { issue: 'API menu missing in Wiza.', resolution: 'Your plan/account is likely not API-enabled yet; contact Wiza support.' },
      { issue: 'Auth errors after user change.', resolution: 'Regenerate key tied to the correct API User context.' }
    ],
    officialLinks: [
      { label: 'Wiza API Help', url: 'https://help.wiza.co/en/articles/8392662-wiza-s-api-everything-you-need-to-know' },
      { label: 'Wiza API Docs', url: 'https://wiza.co/api-docs' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'forager',
    providerType: 'FORAGER',
    name: 'Forager',
    category: 'Data Enrichment',
    summary: 'B2B contact enrichment through Forager API credentials.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'Forager API key from app.forager.ai/keys.' }
    ],
    prerequisites: ['Forager account with API access.'],
    credentialSteps: [
      'Create or sign in to account at app.forager.ai.',
      'Open API keys section and create a new key.',
      'Copy key and note associated account context.',
      'Keep key private and rotate when shared externally.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Test Connection succeeds.', 'Forager appears in enrichment fallback sequence without auth errors.'],
    commonPitfalls: [
      { issue: 'Provider returns unauthorized.', resolution: 'Use active key from API keys page and verify account is active.' },
      { issue: 'Unexpected endpoint errors.', resolution: 'Confirm account-level API enablement and usage quotas.' }
    ],
    officialLinks: [
      { label: 'Forager Create Account', url: 'https://docs.forager.ai/api-overview/create-an-account' },
      { label: 'Forager Authentication', url: 'https://docs.forager.ai/api-overview/authentication' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'zeliq',
    providerType: 'ZELIQ',
    name: 'Zeliq',
    category: 'Data Enrichment',
    summary: 'Email/phone waterfall enrichment provider with account-level API key.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'Zeliq API key from Settings → Integration.' }
    ],
    prerequisites: ['Zeliq account with API plan access.'],
    credentialSteps: [
      'Sign in to Zeliq and navigate to Settings → Integration.',
      'Copy existing API key (or rotate if needed).',
      'Use this key for account creation in Admin → Providers.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Provider health check shows healthy.', 'Enrichment calls run with no 401 errors.'],
    commonPitfalls: [
      { issue: 'Key copied from wrong workspace.', resolution: 'Confirm workspace/environment and recopy key.' },
      { issue: 'Quota exhaustion.', resolution: 'Review plan limits in Zeliq and rebalance enrichment order.' }
    ],
    officialLinks: [
      { label: 'Zeliq Create API Keys', url: 'https://docs.zeliq.com/docs/create-api-keys' },
      { label: 'Zeliq Test API Key', url: 'https://docs.zeliq.com/docs/test-api-key' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'contactout',
    providerType: 'CONTACTOUT',
    name: 'ContactOut',
    category: 'Data Enrichment',
    summary: 'Contact enrichment provider authenticated with a ContactOut token header.',
    credentials: [
      { key: 'apiKey', label: 'API Key / Token', required: true, description: 'ContactOut API token used in the token header.' }
    ],
    prerequisites: ['ContactOut API access granted by ContactOut team (usually via sales/onboarding).'],
    credentialSteps: [
      'Request API access through ContactOut (sales call or API onboarding).',
      'Obtain your API token from ContactOut onboarding or API dashboard.',
      'Store token securely; do not expose in client code.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Test Connection passes.', 'Requests complete without token header/auth errors.'],
    commonPitfalls: [
      { issue: 'Unauthorized or forbidden responses.', resolution: 'Verify API access entitlement and active token value.' },
      { issue: 'Rate limiting.', resolution: 'Monitor endpoint-specific ContactOut limits and reduce burst traffic.' }
    ],
    officialLinks: [
      { label: 'ContactOut API Reference', url: 'https://api.contactout.com/' },
      { label: 'ContactOut API Access Page', url: 'https://contactout.com/api-feature' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'datagma',
    providerType: 'DATAGM',
    name: 'Datagma (DataGM)',
    category: 'Data Enrichment',
    summary: 'Datagma enrichment provider configured with a dashboard API key.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'Datagma API key from API → Key and Docs.' }
    ],
    prerequisites: ['Datagma account with API access.'],
    credentialSteps: [
      'Log in to Datagma dashboard.',
      'Open API section (Key and Docs) from the left navigation.',
      'Copy API key and keep it private.',
      'Confirm the key is active and not restricted to another environment.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Provider card becomes healthy after testing.', 'Datagma enrichment attempts execute without auth failures.'],
    commonPitfalls: [
      { issue: 'Unable to find key in dashboard.', resolution: 'Confirm account role/permissions; some workspaces restrict key visibility.' },
      { issue: 'Unexpected throttling.', resolution: 'Datagma API has per-second constraints; tune queue throughput or fallback order.' }
    ],
    officialLinks: [
      { label: 'Datagma API Help Center', url: 'https://help.datagma.com/en/collections/3720255-api-doc' },
      { label: 'Datagma API Reference', url: 'https://datagmaapi.readme.io/reference/ingressservice_findpeople' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'people-data-labs',
    providerType: 'PEOPLEDATALABS',
    name: 'People Data Labs',
    category: 'Data Enrichment',
    summary: 'Person/company enrichment using People Data Labs API key.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'PDL key from dashboard.peopledatalabs.com.' }
    ],
    prerequisites: ['PDL account and active API subscription/credits.'],
    credentialSteps: [
      'Sign in to PDL dashboard.',
      'Open API keys section and copy active key.',
      'Optionally create separate keys per environment/team.',
      'Keep the key in a secure vault and rotate periodically.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Health check succeeds.', 'PDL requests no longer fail with auth/rate-limit errors during campaigns.'],
    commonPitfalls: [
      { issue: 'Unexpected 429s.', resolution: 'Check endpoint-specific rate limits and reduce enrichment concurrency if necessary.' },
      { issue: 'Using wrong key/project.', resolution: 'Verify key belongs to the intended workspace in the PDL dashboard.' }
    ],
    officialLinks: [
      { label: 'PDL Authentication', url: 'https://docs.peopledatalabs.com/docs/authentication' },
      { label: 'PDL Usage Limits', url: 'https://docs.peopledatalabs.com/docs/usage-limits' },
      { label: 'PDL Dashboard', url: 'https://dashboard.peopledatalabs.com' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'linkedin',
    providerType: 'LINKEDIN',
    name: 'LinkedIn Messaging (Legacy)',
    category: 'Outreach & Messaging',
    summary: 'Legacy LinkedIn outreach token provider. New sourcing integrations should use LinkedIn Sales Navigator.',
    credentials: [
      { key: 'apiKey', label: 'API Key / Access Token', required: true, description: 'LinkedIn API credential/token used for outbound calls.' }
    ],
    prerequisites: [
      'LinkedIn Developer app and approved permissions for the API capabilities you plan to use.',
      'Awareness that LinkedIn messaging APIs are partner-restricted for many automation scenarios.'
    ],
    credentialSteps: [
      'Create/select your app in LinkedIn Developer Portal.',
      'Collect Client ID/Secret from Auth tab and generate access token according to approved flow.',
      'For messaging use cases, confirm your app is approved for relevant partner APIs.',
      'Store the credential/token in this provider account.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Provider health check passes against LinkedIn API.', 'Outreach requests return normal delivery/queueing outcomes.'],
    commonPitfalls: [
      { issue: '403 insufficient permissions.', resolution: 'Your app likely lacks LinkedIn partner permissions for messaging endpoints.' },
      { issue: 'Token expires quickly.', resolution: 'Implement token refresh/rotation process and update provider credentials promptly.' }
    ],
    officialLinks: [
      { label: 'LinkedIn Developer Portal', url: 'https://www.linkedin.com/developers/apps' },
      { label: 'LinkedIn Messages API Restrictions', url: 'https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages' },
      { label: 'LinkedIn OAuth Client Credentials', url: 'https://learn.microsoft.com/en-us/linkedin/shared/authentication/client-credentials-flow' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'email-provider',
    providerType: 'EMAIL_PROVIDER',
    name: 'Email Provider',
    category: 'Outreach & Messaging',
    summary: 'Generic email delivery provider credential (one API key field) for outreach email sends.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'API key from your chosen email platform (SendGrid/Mailgun/Resend/etc.).' }
    ],
    prerequisites: [
      'A transactional email provider account.',
      'Verified sender domain and DNS records (SPF, DKIM, DMARC as recommended).'
    ],
    credentialSteps: [
      'Choose an email provider (for example SendGrid, Mailgun, Resend, Amazon SES).',
      'Create API key with sending permissions only (principle of least privilege).',
      'Verify your sender identity/domain in the provider dashboard.',
      'Copy API key and save in this provider account.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Test Connection succeeds.', 'Outbound email threads are created and delivery status updates appear.'],
    commonPitfalls: [
      { issue: 'API key works but emails fail.', resolution: 'Check sender/domain verification and suppression/bounce policies.' },
      { issue: 'High spam placement.', resolution: 'Configure SPF/DKIM/DMARC and warm up domains/IPs.' }
    ],
    officialLinks: [
      { label: 'SendGrid API Keys', url: 'https://docs.sendgrid.com/api-reference/api-keys/create-api-keys' },
      { label: 'Mailgun API Keys', url: 'https://help.mailgun.com/hc/en-us/articles/203380100-Where-can-I-find-my-API-keys-and-SMTP-credentials' },
      { label: 'Resend API Keys', url: 'https://resend.com/docs/dashboard/api-keys/introduction' },
      { label: 'Amazon SES SMTP Credentials', url: 'https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'twilio',
    providerType: 'TWILIO',
    name: 'Twilio',
    category: 'Outreach & Messaging',
    summary: 'SMS/iMessage/voice channel provider using Twilio Account SID and Auth Token.',
    credentials: [
      { key: 'accountSid', label: 'Account SID', required: true, description: 'Found in Twilio Console dashboard account info.' },
      { key: 'authToken', label: 'Auth Token', required: true, description: 'Primary auth token revealed in Twilio Console.' }
    ],
    prerequisites: [
      'Twilio account with active messaging products/channels.',
      'Provisioned sender identities (phone numbers, messaging services, or approved channels).'
    ],
    credentialSteps: [
      'Open Twilio Console and locate Account Info on the dashboard.',
      'Copy Account SID.',
      'Reveal Auth Token using the eye icon and copy securely.',
      'Optionally create subaccount/API keys for tighter scoping if your process supports it.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Provider health check succeeds against Twilio account endpoint.', 'SMS/iMessage sends queue successfully.'],
    commonPitfalls: [
      { issue: '401 from Twilio account API.', resolution: 'Double-check SID/token pair and ensure no hidden whitespace.' },
      { issue: 'Delivery failures by region.', resolution: 'Check sender provisioning, geographies, and carrier restrictions.' }
    ],
    officialLinks: [
      { label: 'Twilio Console', url: 'https://www.twilio.com/console' },
      { label: 'Twilio Auth Token Docs', url: 'https://www.twilio.com/docs/iam/api/authtoken' },
      { label: 'Twilio API Keys in Console', url: 'https://www.twilio.com/docs/iam/api-keys/keys-in-console' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'whatsapp-2chat',
    providerType: 'WHATSAPP_2CHAT',
    name: 'WhatsApp (2Chat)',
    category: 'Outreach & Messaging',
    summary: 'WhatsApp messaging via 2Chat API key integration.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: '2Chat user API key from Developers → API Access.' }
    ],
    prerequisites: [
      '2Chat account with at least one connected WhatsApp channel.',
      'Channel policies/compliance configured in 2Chat.'
    ],
    credentialSteps: [
      'Sign in to app.2chat.io.',
      'Connect your WhatsApp channel in Channels section.',
      'Open Developers → API Access and create/copy API key.',
      'Use this key in platform provider configuration.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    webhookConfiguration: {
      endpointTemplate: 'Configurable per your workflow endpoint',
      method: 'POST',
      expectedHeaders: ['X-User-API-Key (for subscription calls from your side)'],
      notes: [
        '2Chat supports webhook subscriptions for message and call-related events.',
        'Set publicly reachable HTTPS callback URLs when enabling webhooks in 2Chat.'
      ]
    },
    validationChecklist: ['Test Connection succeeds.', 'WhatsApp outreach messages are accepted by queue and provider.'],
    commonPitfalls: [
      { issue: 'API key valid but sends fail.', resolution: 'Check if target WhatsApp channel is connected/active in 2Chat.' },
      { issue: 'No event callbacks.', resolution: 'Verify webhook URL reachability and subscription event selection.' }
    ],
    officialLinks: [
      { label: '2Chat API Authentication', url: 'https://developers.2chat.co/docs/API/authentication' },
      { label: '2Chat Developer Portal', url: 'https://app.2chat.io/developers?tab=api-access' },
      { label: '2Chat Webhooks', url: 'https://developers.2chat.co/docs/category/webhooks' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'respond-io',
    providerType: 'RESPONDIO',
    name: 'Respond.io',
    category: 'Outreach & Messaging',
    summary: 'Multi-channel messaging integration using Respond.io Developer API access token.',
    credentials: [
      { key: 'apiKey', label: 'API Key / Access Token', required: true, description: 'Developer API token from Workspace Settings → Integrations.' }
    ],
    prerequisites: ['Respond.io Growth plan or above (Developer API access requirement).'],
    credentialSteps: [
      'Open respond.io workspace settings.',
      'Go to Integrations and edit Developer API.',
      'Click Add Access Token and copy generated token.',
      'Store token in provider account.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    webhookConfiguration: {
      endpointTemplate: 'Configurable respond.io webhook endpoint per event',
      method: 'POST',
      expectedHeaders: ['Respond.io webhook signature/header as configured by workspace'],
      notes: [
        'Respond.io supports webhooks for contact/message/conversation events.',
        'Use webhooks if you want external event fan-out or auditing beyond built-in polling.'
      ]
    },
    validationChecklist: ['Provider health check passes.', 'Outbound respond.io channel messages can be queued and sent.'],
    commonPitfalls: [
      { issue: 'Token missing after rotation.', resolution: 'Create new token and update provider credentials immediately.' },
      { issue: 'Webhooks not firing.', resolution: 'Check plan entitlement, event subscription selection, and callback endpoint SSL.' }
    ],
    officialLinks: [
      { label: 'Respond.io Developer API', url: 'https://help.respond.io/l/en/integrations/developer-api' },
      { label: 'Respond.io Webhooks', url: 'https://help.respond.io/l/en/integrations/webhooks' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'line',
    providerType: 'LINE',
    name: 'LINE',
    category: 'Outreach & Messaging',
    summary: 'LINE Messaging API channel integration with channel access token credential.',
    credentials: [
      { key: 'apiKey', label: 'API Key / Channel Access Token', required: true, description: 'LINE Messaging API channel access token.' }
    ],
    prerequisites: [
      'LINE Developers account.',
      'Messaging API channel created under your provider.'
    ],
    credentialSteps: [
      'Go to developers.line.biz and create/select a provider.',
      'Create a Messaging API channel.',
      'Issue a channel access token (long-lived or v2.1 token flow).',
      'Copy token and store as provider credential.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    webhookConfiguration: {
      endpointTemplate: 'Configured in LINE Developers console per channel',
      method: 'POST',
      expectedHeaders: ['LINE signature/header as defined by LINE platform'],
      notes: [
        'Set webhook URL in channel Messaging API settings when bidirectional events are needed.',
        'Rotate channel tokens periodically or use v2.1 issuance for tighter expiration control.'
      ]
    },
    validationChecklist: ['Health check succeeds against LINE bot info endpoint.', 'Message sends work for target LINE users/channels.'],
    commonPitfalls: [
      { issue: 'Token invalid errors.', resolution: 'Issue a fresh channel access token and verify correct channel context.' },
      { issue: 'No inbound events.', resolution: 'Enable and verify webhook URL in LINE Developers console.' }
    ],
    officialLinks: [
      { label: 'LINE Messaging API Getting Started', url: 'https://developers.line.biz/en/docs/messaging-api/getting-started/' },
      { label: 'LINE Channel Access Tokens', url: 'https://developers.line.biz/en/docs/basics/channel-access-token/' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'wechat',
    providerType: 'WECHAT',
    name: 'WeChat',
    category: 'Outreach & Messaging',
    summary: 'WeChat Official Account integration using developer credentials and token flow.',
    credentials: [
      { key: 'apiKey', label: 'API Key / Access Token', required: true, description: 'WeChat API credential/token used for integration calls.' }
    ],
    prerequisites: [
      'Verified WeChat Official Account.',
      'Developer mode enabled for the account.'
    ],
    credentialSteps: [
      'Sign in to WeChat Official Account admin (mp.weixin.qq.com).',
      'Enable developer mode and configure callback domain/server verification.',
      'Retrieve AppID/AppSecret and generate access token per WeChat docs.',
      'Store token/credential value expected by your integration process.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Provider health check passes.', 'Outbound messages work for configured WeChat channel.'],
    commonPitfalls: [
      { issue: 'Token expired.', resolution: 'Implement token refresh cadence and replace stale token promptly.' },
      { issue: 'Webhook verification fails.', resolution: 'Re-check callback URL, signature logic, and account verification status.' }
    ],
    officialLinks: [
      { label: 'WeChat Getting Started Guide', url: 'https://developers.weixin.qq.com/doc/offiaccount/en/Getting_Started/Getting_Started_Guide.html' },
      { label: 'WeChat Access Overview', url: 'https://developers.weixin.qq.com/doc/offiaccount/en/Basic_Information/Access_Overview.html' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'viber',
    providerType: 'VIBER',
    name: 'Viber',
    category: 'Outreach & Messaging',
    summary: 'Viber bot integration using bot authentication token.',
    credentials: [
      { key: 'apiKey', label: 'API Key / Auth Token', required: true, description: 'Viber bot token used in X-Viber-Auth-Token header.' }
    ],
    prerequisites: [
      'Viber bot created and approved (commercial terms apply for new bots).',
      'Access to bot admin panel/token.'
    ],
    credentialSteps: [
      'Create/select your Viber bot account.',
      'Open bot settings/edit info and copy authentication token (app key).',
      'Store token securely and avoid exposing in client-side code.',
      'Set webhook URL for bot events if required by your operational flow.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Provider health check succeeds.', 'Outbound messages and account info calls work.'],
    commonPitfalls: [
      { issue: 'missing_auth_token errors.', resolution: 'Ensure the exact bot token is saved and active in provider credentials.' },
      { issue: 'Bot unavailable for new setup.', resolution: 'Check Viber commercial onboarding requirements and account eligibility.' }
    ],
    officialLinks: [
      { label: 'Viber Authentication', url: 'https://creators.viber.com/docs/bots-api/getting-started/authentication' },
      { label: 'Viber REST Bot API', url: 'https://developers.viber.com/docs/api/rest-bot-api/' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'telegram',
    providerType: 'TELEGRAM',
    name: 'Telegram',
    category: 'Outreach & Messaging',
    summary: 'Telegram bot integration using BotFather-issued bot token.',
    credentials: [
      { key: 'botToken', label: 'Bot Token', required: true, description: 'Telegram bot token generated by BotFather.' }
    ],
    prerequisites: ['Telegram account with access to BotFather.'],
    credentialSteps: [
      'Open Telegram and start chat with @BotFather.',
      'Run /newbot and provide bot display name + unique username.',
      'Copy the bot token returned by BotFather.',
      'Optionally verify token quickly via https://api.telegram.org/bot<TOKEN>/getMe.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Provider health check getMe returns ok=true.', 'Outbound Telegram sends are accepted by queue/provider.'],
    commonPitfalls: [
      { issue: 'Token revoked accidentally.', resolution: 'Regenerate with BotFather and update provider credentials.' },
      { issue: 'Messages not delivered.', resolution: 'Confirm recipients initiated chat or bot has required permissions in target chats.' }
    ],
    officialLinks: [
      { label: 'Telegram Bot Tutorial', url: 'https://core.telegram.org/bots/tutorial' },
      { label: 'BotFather', url: 'https://t.me/BotFather' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'kakaotalk',
    providerType: 'KAKAOTALK',
    name: 'KakaoTalk',
    category: 'Outreach & Messaging',
    summary: 'KakaoTalk messaging provider configured with Kakao REST API key.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'Kakao REST API key from app settings.' }
    ],
    prerequisites: ['Kakao Developers account and application created.'],
    credentialSteps: [
      'Open developers.kakao.com and create/select an application.',
      'Navigate to app keys/platform key area.',
      'Copy the REST API Key.',
      'Save it as the provider credential in this platform.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: ['Provider health check succeeds.', 'Kakao channel calls authenticate using the saved key.'],
    commonPitfalls: [
      { issue: 'Auth format mismatch.', resolution: 'Kakao APIs often require Authorization: KakaoAK <REST_API_KEY>.' },
      { issue: 'Platform mismatch after key rotation.', resolution: 'Update the latest primary key in provider credentials.' }
    ],
    officialLinks: [
      { label: 'Kakao App Settings', url: 'https://developers.kakao.com/docs/latest/en/app-setting/app' },
      { label: 'Kakao REST API Guides', url: 'https://developers.kakao.com/docs/latest/en/business-auth/rest-api' },
      { label: 'Kakao App Key Changes', url: 'https://developers.kakao.com/docs/latest/en/getting-started/app-key-migration' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'voicemail-drop',
    providerType: 'VOICEMAIL_DROP',
    name: 'Voicemail Drop',
    category: 'Outreach & Messaging',
    summary: 'Ringless voicemail provider credential (single API key field) for voicemail drops.',
    credentials: [
      {
        key: 'apiKey',
        label: 'API Key',
        required: true,
        description: 'Provider token/secret used by your voicemail drop vendor integration.'
      }
    ],
    prerequisites: [
      'Contracted voicemail-drop vendor (for example Slybroadcast, Drop Cowboy, or equivalent).',
      'Compliance approval for voicemail outreach in target regions.'
    ],
    credentialSteps: [
      'Create API credentials in your chosen voicemail provider dashboard.',
      'Prefer token/secret credentials over username/password where available.',
      'If your provider requires multi-value auth, generate a single scoped token for this integration when possible.',
      'Store credential in this provider account and document the vendor used in the account label.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: [
      'Provider card tests healthy with your selected vendor credential.',
      'Voicemail-drop outreach jobs can be queued with no auth errors.'
    ],
    commonPitfalls: [
      { issue: 'Vendor expects multiple credentials.', resolution: 'Use vendor-issued integration token/API secret compatible with one-key field, or route through your middleware.' },
      { issue: 'Regional/legal blocking.', resolution: 'Verify country/state voicemail regulations and caller-ID requirements before launching campaigns.' }
    ],
    officialLinks: [
      { label: 'Slybroadcast API Docs', url: 'https://slybroadcast.com/documentationjson.php' },
      { label: 'Drop Cowboy API', url: 'https://www.dropcowboy.com/api' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'yay',
    providerType: 'YAY',
    name: 'Yay.com',
    category: 'Calling & Operations',
    summary: 'Calling provider requiring API key plus webhook secret for signed call-event ingestion.',
    credentials: [
      { key: 'apiKey', label: 'API Key', required: true, description: 'Yay API credential for account/call API access.' },
      { key: 'webhookSecret', label: 'Webhook Secret', required: true, description: 'Shared secret used to verify Yay webhook signatures.' }
    ],
    prerequisites: [
      'Yay VoIP account with API access.',
      'Ability to configure outbound webhooks to your API host.'
    ],
    credentialSteps: [
      'Generate/copy your Yay API key from Yay API/account settings.',
      'Create a webhook signing secret in Yay webhook configuration.',
      'Store both values in this provider account.'
    ],
    platformConfiguration: [
      ...sharedPlatformSteps,
      'Configure Yay to POST call events to /webhooks/yay/{providerAccountId}.',
      'Ensure raw payload delivery is enabled if your Yay configuration supports body transformation options.'
    ],
    webhookConfiguration: {
      endpointTemplate: 'https://<your-api-host>/webhooks/yay/{providerAccountId}',
      method: 'POST',
      expectedHeaders: ['x-yay-signature', 'x-yay-timestamp', 'x-yay-event-id'],
      notes: [
        'This platform verifies HMAC signature and timestamp freshness before accepting events.',
        'Supported event types include call.started, call.ringing, call.answered, call.ended, call.failed, call.recording_ready.',
        'Duplicate x-yay-event-id payloads are deduplicated automatically.'
      ]
    },
    validationChecklist: [
      'Provider health check hits Yay account endpoint successfully.',
      'Webhook calls return accepted and appear in call pipeline.'
    ],
    commonPitfalls: [
      { issue: 'Signature verification failure.', resolution: 'Re-check webhook secret and ensure payload body is not modified by proxies.' },
      { issue: 'Event rejected as stale.', resolution: 'Validate sender/server clocks and timestamp units.' }
    ],
    officialLinks: [
      { label: 'Yay VoIP API Docs', url: 'https://www.yay.com/voip/api-docs/calls/outbound-call/' },
      { label: 'Yay Webhook FAQ', url: 'https://www.yay.com/faq/cloud-pbx/webhooks-notifications/' }
    ],
    lastReviewed: '2026-02-28'
  },
  {
    slug: 'google-sheets',
    providerType: 'GOOGLE_SHEETS',
    name: 'Google Sheets',
    category: 'Data Sync',
    summary: 'Google Sheets sync provider using Spreadsheet ID and service-account JSON credentials.',
    credentials: [
      { key: 'spreadsheetId', label: 'Spreadsheet ID', required: true, description: 'Sheet ID from docs.google.com URL (/d/<id>/edit).' },
      { key: 'serviceAccountJson', label: 'Service Account JSON', required: true, description: 'Full JSON key for a Google Cloud service account.' }
    ],
    prerequisites: [
      'Google Cloud project with billing/API access as required.',
      'Google Sheets API + Google Drive API enabled.',
      'Service account created with JSON key downloaded.'
    ],
    credentialSteps: [
      'Open Google Cloud Console and create/select a project.',
      'Enable Google Sheets API and Google Drive API.',
      'Create a Service Account and generate a JSON key file.',
      'Share target spreadsheet with service account email as Editor.',
      'Copy Spreadsheet ID from sheet URL and paste both fields into provider form.'
    ],
    platformConfiguration: [...sharedPlatformSteps],
    validationChecklist: [
      'Health check succeeds (JWT service-account flow + spreadsheet read).',
      'Export records start appearing in the destination spreadsheet.'
    ],
    commonPitfalls: [
      { issue: 'Permission denied on test.', resolution: 'Share spreadsheet with service account client_email and confirm correct spreadsheet ID.' },
      { issue: 'Invalid JSON credentials.', resolution: 'Paste full unmodified service-account JSON, including private_key line breaks.' }
    ],
    officialLinks: [
      { label: 'Google Create Credentials', url: 'https://developers.google.com/workspace/guides/create-credentials' },
      { label: 'Google Cloud Console', url: 'https://console.cloud.google.com/' },
      { label: 'Service Account Credentials (IAM)', url: 'https://docs.cloud.google.com/iam/docs/service-account-creds' }
    ],
    lastReviewed: '2026-02-28'
  }
];

const categoryOrder: ProviderCategory[] = [
  'Lead Sourcing',
  'Data Enrichment',
  'Outreach & Messaging',
  'Calling & Operations',
  'Data Sync'
];

export const providerGuideDocBySlug = Object.fromEntries(
  providerGuideDocs.map((doc) => [doc.slug, doc])
) as Record<string, ProviderGuideDoc>;

export const providerGuideCategories = categoryOrder.map((category) => ({
  category,
  docs: providerGuideDocs
    .filter((doc) => doc.category === category)
    .sort((a, b) => a.name.localeCompare(b.name))
}));
