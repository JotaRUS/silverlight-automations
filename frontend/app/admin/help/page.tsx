'use client';

import Link from 'next/link';

import { Card } from '@/components/ui/card';

const tocSections = [
  { id: 'overview', label: 'Platform Overview' },
  { id: 'latest', label: 'Latest Changes' },
  { id: 'navigation', label: 'Navigating the Portal' },
  { id: 'users', label: 'Users & Access' },
  { id: 'project-updates', label: 'Project Operations Updates' },
  { id: 'concepts', label: 'Key Concepts' },
  { id: 'providers', label: 'Provider Setup Guides' },
  { id: 'workflows', label: 'Common Workflows' },
  { id: 'faq', label: 'FAQ & Troubleshooting' }
];

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }): JSX.Element {
  return (
    <h2 id={id} className="scroll-mt-20 text-xl font-bold text-slate-900 mb-4">
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }): JSX.Element {
  return <h3 className="text-base font-semibold text-slate-800 mt-6 mb-2">{children}</h3>;
}

function ProviderGuide({
  name,
  role,
  fields,
  steps,
  links,
  notes
}: {
  name: string;
  role: string;
  fields: string[];
  steps: string[];
  links?: { label: string; url: string }[];
  notes?: string;
}): JSX.Element {
  return (
    <details className="group border border-slate-200 rounded-lg">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-lg select-none">
        <span>{name}</span>
        <span className="text-xs text-slate-400 ml-2 hidden sm:inline">{role}</span>
        <span className="material-symbols-outlined ml-auto text-slate-400 text-lg transition-transform group-open:rotate-180">
          expand_more
        </span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-3 space-y-3 text-sm text-slate-600">
        <p className="text-slate-500 italic">{role}</p>
        <div>
          <p className="font-medium text-slate-700 mb-1">Fields to fill in:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {fields.map((f) => (
              <li key={f}><code className="bg-slate-100 px-1 rounded text-xs">{f}</code></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-700 mb-1">How to get your credentials:</p>
          <ol className="list-decimal list-inside space-y-1">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
        {links && links.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-1">
            {links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 text-xs"
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
        {notes && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">{notes}</p>}
      </div>
    </details>
  );
}

export default function HelpPage(): JSX.Element {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Help Center</h1>
        <p className="mt-1 text-sm text-slate-500">Everything you need to know about using the Expert Sourcing platform.</p>
      </div>

      {/* Table of Contents */}
      <Card className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">Quick Navigation</p>
        <nav className="flex flex-wrap gap-2">
          {tocSections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="inline-block rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
            >
              {s.label}
            </a>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/admin/help/api"
            className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"
          >
            API Docs
          </Link>
          <Link
            href="/admin/api-keys"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600"
          >
            API Keys
          </Link>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 1 — PLATFORM OVERVIEW                                      */}
      {/* ------------------------------------------------------------------ */}
      <Card className="space-y-4">
        <SectionHeading id="overview">Platform Overview</SectionHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          The Expert Sourcing Automation Platform helps you find, verify, and reach out to domain experts at
          scale. It automates the full pipeline: discovering potential experts from sources like Apollo and
          LinkedIn Sales Navigator, enriching their contact details through multiple data providers, running
          multi-channel outreach (email, phone, WhatsApp, Telegram, and more), managing call campaigns, and
          screening respondents for qualification. The system includes an auto-sourcing engine that continuously
          queues enrichment and outreach in the background until each project reaches its target expert count —
          no external scraper dependency required.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium py-3">
          {[
            { label: 'Sources', desc: 'Apollo, Sales Nav' },
            { label: 'Leads', desc: 'Imported profiles' },
            { label: 'Enrichment', desc: 'Contact discovery' },
            { label: 'Outreach', desc: '13 channels' },
            { label: 'Screening', desc: 'Qualification' },
            { label: 'Conversion', desc: 'Expert sign-up' }
          ].map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-center">
                <p className="font-bold text-primary">{step.label}</p>
                <p className="text-[10px] text-slate-500 font-normal">{step.desc}</p>
              </div>
              {i < 5 && <span className="text-slate-300 text-lg">&#8594;</span>}
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Everything runs automatically in the background once configured. Your role as an admin is to set up
          projects, connect provider accounts with API keys, monitor progress, and review results.
        </p>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 1B — LATEST CHANGES                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card className="space-y-4">
        <SectionHeading id="latest">Latest Changes</SectionHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          The admin portal was recently expanded with user management, account settings, richer project controls,
          and stronger provider onboarding flows. If you used an older version of this platform, these are the
          key updates to know:
        </p>
        <div className="space-y-3">
          {[
            {
              icon: 'group',
              title: 'Users module',
              desc: 'A dedicated Users page now supports creating, editing, and deleting ADMIN / OPS / CALLER accounts.'
            },
            {
              icon: 'manage_accounts',
              title: 'Account settings',
              desc: 'The profile menu in the top-right now includes Account Settings, where users can update display name and password.'
            },
            {
              icon: 'work',
              title: 'Project wizard + edit upgrades',
              desc: 'Project setup now includes guided provider selection, and project edit pages support status, geography, priority, provider bindings, and cooldown controls.'
            },
            {
              icon: 'monitoring',
              title: 'Operational views improved',
              desc: 'Leads, Outreach, and Screening pages include cleaner status summaries, filter-first layouts, and action menus for quick updates.'
            },
            {
              icon: 'key',
              title: 'Provider setup expanded',
              desc: 'Provider management now includes Sales Navigator OAuth credentials, health checks, activation toggles, and credential rotation from account cards.'
            }
          ].map((item) => (
            <div key={item.title} className="flex gap-3 items-start">
              <span className="material-symbols-outlined text-primary text-xl mt-0.5 shrink-0">{item.icon}</span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 2 — NAVIGATING THE PORTAL                                  */}
      {/* ------------------------------------------------------------------ */}
      <Card className="space-y-4">
        <SectionHeading id="navigation">Navigating the Admin Portal</SectionHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          The left sidebar (icons on desktop, bottom bar on mobile) gives you access to every section of the
          platform. Here is what each screen does:
        </p>
        <div className="space-y-3">
          {[
            {
              icon: 'grid_view', name: 'Dashboard',
              desc: 'Your home screen. Shows live statistics, the call board with active callers, allocation trends over time, and a real-time activity feed of recent system events.'
            },
            {
              icon: 'corporate_fare', name: 'Providers',
              desc: 'Where you connect external services. Add API keys for enrichment providers, messaging channels, phone systems, and data sync tools. Each provider account can be bound to one or more projects.'
            },
            {
              icon: 'work', name: 'Projects',
              desc: 'Create and manage sourcing campaigns. Each project targets a specific number of experts, tracks geography, and has its own provider bindings and enrichment routing configuration.'
            },
            {
              icon: 'contact_support', name: 'Leads',
              desc: 'Browse all imported leads across projects. Filter by status (New, Enriching, Enriched, etc.), search by name or company, and view enrichment details.'
            },
            {
              icon: 'campaign', name: 'Outreach',
              desc: 'Monitor all outreach threads across every channel. See which experts have been contacted, who has replied, and the full conversation history.'
            },
            {
              icon: 'fact_check', name: 'Screening',
              desc: 'Review screening question responses from experts. Track who has completed screening, score responses, and mark experts as qualified.'
            },
            {
              icon: 'podium', name: 'Calls',
              desc: 'Live call allocation board. See which callers are assigned to which tasks, track dial attempts, outcomes, and manage the calling queue.'
            },
            {
              icon: 'bar_chart', name: 'Ranking',
              desc: 'View ranking snapshots for experts and projects. Rankings are computed based on engagement, qualification scores, and other factors.'
            },
            {
              icon: 'sensors', name: 'Observability',
              desc: 'System health monitoring. View the dead-letter queue for failed background jobs, webhook processing logs, fraud detection flags, and system events.'
            },
            {
              icon: 'group', name: 'Users',
              desc: 'Admin-only account management. Create new users, edit roles/timezones, rotate passwords, and deactivate team access by deleting accounts.'
            }
          ].map((item) => (
            <div key={item.name} className="flex gap-3 items-start">
              <span className="material-symbols-outlined text-primary text-xl mt-0.5 shrink-0">{item.icon}</span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 2B — USERS & ACCESS                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card className="space-y-4">
        <SectionHeading id="users">Users &amp; Access</SectionHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          Authentication now uses email + password accounts. Access is role-based and enforced at the API layer.
          Use this section to manage who can administer the platform and how they authenticate.
        </p>

        <SubHeading>Roles and scope</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          {[
            { role: 'ADMIN', scope: 'Full platform administration, including user management.' },
            { role: 'OPS', scope: 'Operations workflows: projects, leads, outreach, screening, calls.' },
            { role: 'CALLER', scope: 'Caller-facing execution flows; limited admin capabilities.' }
          ].map((item) => (
            <div key={item.role} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">{item.role}</p>
              <p className="mt-1 text-slate-500 leading-relaxed">{item.scope}</p>
            </div>
          ))}
        </div>

        <SubHeading>Manage users (Admins)</SubHeading>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
          <li>Open <strong>Users</strong> from the left sidebar.</li>
          <li>Click <strong>Add User</strong> to create a new account with role and timezone.</li>
          <li>Use the edit icon to update email, name, password, role, or timezone.</li>
          <li>Use delete to remove access. You cannot delete your own currently signed-in account.</li>
        </ol>

        <SubHeading>Update your own profile</SubHeading>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
          <li>Click your avatar in the top-right header.</li>
          <li>Select <strong>Settings</strong>.</li>
          <li>Update your display name, and optionally set a new password.</li>
          <li>When changing password, enter your current password for verification.</li>
        </ol>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 2C — PROJECT OPERATIONS UPDATES                            */}
      {/* ------------------------------------------------------------------ */}
      <Card className="space-y-4">
        <SectionHeading id="project-updates">Project Operations Updates</SectionHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          Project configuration has been upgraded across creation, editing, and list monitoring so operators can
          control sourcing campaigns with fewer clicks.
        </p>

        <SubHeading>Project list improvements</SubHeading>
        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 ml-1">
          <li>Status badges for Active / Paused / Completed / Archived.</li>
          <li>Progress bars with completion percentage and signed-up vs target context.</li>
          <li>Priority indicators and region badges directly in the table.</li>
          <li>Clickable rows for fast navigation to project edit screens.</li>
        </ul>

        <SubHeading>Wizard flow updates</SubHeading>
        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 ml-1">
          <li>Step 1 captures project details (name, target, geography, priority).</li>
          <li>Step 2 presents configured provider accounts grouped by function.</li>
          <li>Only one account per provider type can be selected per project.</li>
          <li>You can bind selected providers immediately or skip and bind later.</li>
        </ul>

        <SubHeading>Edit project controls</SubHeading>
        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 ml-1">
          <li>Update status, geography, threshold, priority, and cooldown override in one screen.</li>
          <li>Adjust provider bindings via the same matrix used in creation.</li>
          <li>Use quick links to jump from project edit into Leads and Outreach views.</li>
        </ul>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 3 — KEY CONCEPTS                                           */}
      {/* ------------------------------------------------------------------ */}
      <Card className="space-y-4">
        <SectionHeading id="concepts">Key Concepts</SectionHeading>

        <SubHeading>Lead Lifecycle</SubHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          Every lead progresses through a series of statuses. The system moves leads forward automatically as
          enrichment and outreach complete:
        </p>
        <div className="flex flex-wrap items-center gap-1 text-xs font-medium py-2">
          {['New', 'Enriching', 'Enriched', 'Outreach Pending', 'Contacted', 'Replied', 'Converted'].map((status, i) => (
            <div key={status} className="flex items-center gap-1">
              <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">{status}</span>
              {i < 6 && <span className="text-slate-300">&#8594;</span>}
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-500">
          A lead can also be marked <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 text-xs font-medium">Disqualified</span> at
          any point if they don&apos;t meet project criteria.
        </p>

        <SubHeading>Project Lifecycle</SubHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          Projects start as <strong>Active</strong>. They can be <strong>Paused</strong> (and resumed later),
          marked as <strong>Completed</strong> when the target is met, or <strong>Archived</strong> when no
          longer needed.
        </p>

        <SubHeading>Provider Accounts &amp; Encryption</SubHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          Provider accounts store the API credentials needed to connect to external services. When you enter an
          API key, it is immediately encrypted using <strong>AES-256-GCM</strong> before being stored in the
          database. The key is only decrypted at the exact moment it is needed to make an API call, and is never
          exposed in logs or API responses. The form shows which credential fields are stored, but never the
          actual values.
        </p>

        <SubHeading>Enrichment Pipeline</SubHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          When a lead needs enrichment (finding their email, phone number, etc.), the system can cascade through
          multiple enrichment providers. If the first provider doesn&apos;t return a result, it automatically tries the
          next one. You control which providers are used and in what order through the project&apos;s enrichment
          routing configuration. Supported enrichment providers: LeadMagic, Prospeo, Exa, RocketReach, Wiza,
          Forager, Zeliq, ContactOut, DataGM, and People Data Labs.
        </p>

        <SubHeading>Outreach Channels</SubHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          The platform supports 13 outreach channels. Each one requires its own provider account:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
          {[
            'Phone (Yay)', 'Email', 'LinkedIn', 'WhatsApp (2Chat)', 'SMS (Twilio)',
            'iMessage (Twilio)', 'Telegram', 'LINE', 'WeChat', 'Viber', 'Respond.io',
            'KakaoTalk', 'Voicemail Drop'
          ].map((ch) => (
            <div key={ch} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-600">{ch}</div>
          ))}
        </div>

        <SubHeading>Channel Continuation &amp; Preferred Channel</SubHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          When an expert replies on a specific channel (e.g., WhatsApp), the system automatically records that as
          their preferred channel. All subsequent messages to that expert will be sent via their preferred channel,
          as long as the project has the corresponding provider bound. This ensures a natural conversation flow
          rather than jumping between channels.
        </p>

        <SubHeading>Auto-Sourcing Engine</SubHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          Once a project is created with lead sources, the system&apos;s auto-sourcing engine runs every 5 minutes.
          It automatically:
        </p>
        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 ml-1">
          <li>Queues enrichment for new leads (up to 50 per batch)</li>
          <li>Queues outreach for enriched leads (up to 30 per batch)</li>
          <li>Detects stalled pipelines and creates alerts</li>
        </ul>
        <p className="text-sm text-slate-500 mt-1">
          This continues until the project reaches its target expert count.
        </p>

        <SubHeading>Smart Message Composition</SubHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          During project creation, you write a mandatory outreach message template. The template supports
          dynamic variable placeholders that are resolved for each lead:
        </p>
        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 ml-1">
          <li><code className="text-xs bg-slate-100 px-1 rounded">{`{{FirstName}}`}</code>, <code className="text-xs bg-slate-100 px-1 rounded">{`{{LastName}}`}</code> — lead&apos;s name</li>
          <li><code className="text-xs bg-slate-100 px-1 rounded">{`{{Country}}`}</code> — lead&apos;s country</li>
          <li><code className="text-xs bg-slate-100 px-1 rounded">{`{{JobTitle}}`}</code>, <code className="text-xs bg-slate-100 px-1 rounded">{`{{CurrentCompany}}`}</code> — professional info</li>
        </ul>
        <p className="text-sm text-slate-500 mt-1">
          Outreach is sent automatically after enrichment. If any variable used in the template is missing data for a lead, outreach is skipped for that lead.
        </p>

        <SubHeading>Email Region Rules</SubHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          For regions like Canada, UK, Australia, and Europe, only professional/work emails are used for outreach.
          For other regions, both professional and personal emails may be used. This is enforced automatically.
        </p>

        <SubHeading>Google Sheets Auto-Export</SubHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          When phone numbers are verified during enrichment, they are automatically exported to the designated
          Google Sheet (if the project has a Google Sheets provider bound). No manual sync needed.
        </p>

        <SubHeading>Binding Providers to Projects</SubHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          After creating a provider account, you need to bind it to one or more projects. This tells the system
          which API key to use when working on leads for that project. You can bind providers when creating or
          editing a project. The project creation wizard (Step 2: Lead Sources) shows all configured providers
          as a grid of checkboxes, letting you select which tools to use for the project.
        </p>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 4 — PROVIDER SETUP GUIDES                                  */}
      {/* ------------------------------------------------------------------ */}
      <Card className="space-y-4">
        <SectionHeading id="providers">Provider Setup Guides</SectionHeading>
        <p className="text-sm text-slate-600 leading-relaxed">
          Below you&apos;ll find step-by-step instructions for obtaining credentials from each supported
          provider. On the <strong>Providers</strong> page, select the provider type, give it a label
          (e.g. &quot;Production&quot; or &quot;Team-A&quot;), fill in the credential fields, and click <strong>Create
          Provider Account</strong>. Your credentials are encrypted the moment you save.
        </p>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-slate-700">
          <p className="font-medium text-slate-800">Need full provider docs?</p>
          <p className="mt-1 text-slate-600">
            We now maintain dedicated setup pages for every provider (one page per provider), including
            OAuth/webhook requirements, validation checklists, and official references.
          </p>
          <Link href="/admin/help/providers" className="mt-2 inline-flex items-center gap-1 text-primary font-medium hover:underline">
            Open Provider Setup Directory
            <span className="material-symbols-outlined text-sm">open_in_new</span>
          </Link>
        </div>

        {/* -- Sourcing -- */}
        <SubHeading>Sourcing</SubHeading>
        <div className="space-y-2">
          <ProviderGuide
            name="Apollo"
            role="Job title discovery and lead sourcing"
            fields={['API Key']}
            steps={[
              'Log in to your Apollo.io account.',
              'Go to Settings > Integrations > API.',
              'Click "API Keys" in the sidebar.',
              'Click "Create new key", give it a name, and select the endpoints you need (or toggle "Master key" for full access).',
              'Copy the API key and paste it into the API Key field.'
            ]}
            links={[
              { label: 'Apollo API Key Docs', url: 'https://docs.apollo.io/docs/create-api-key' }
            ]}
            notes="You must be an account admin to create API keys. API access depends on your Apollo pricing plan."
          />
          <ProviderGuide
            name="LinkedIn Sales Navigator"
            role="LinkedIn Sales Navigator lead ingestion via OAuth 2.0"
            fields={['Client ID', 'Client Secret']}
            steps={[
              'Go to the LinkedIn Developer Portal at developer.linkedin.com.',
              'Create a new application (or use an existing one) with Sales Navigator API access.',
              'Open the Auth tab in your app settings.',
              'Copy the Client ID and generate or copy the Client Secret (primary secret).',
              'Paste both values into the corresponding fields in the Providers page.'
            ]}
            links={[
              { label: 'LinkedIn Developer Portal', url: 'https://developer.linkedin.com/' },
              { label: 'Authorization Code Flow Guide', url: 'https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow?tabs=HTTPS1' }
            ]}
            notes="For OAuth 2.0 Authorization Code Flow, set redirect URI to https://silverlight-automations.siblingssoftware.com.ar/api/v1/auth/linkedin/callback and generate auth URLs from /api/v1/auth/linkedin/authorize."
          />
        </div>

        {/* -- Enrichment -- */}
        <SubHeading>Enrichment</SubHeading>
        <p className="text-xs text-slate-500 mb-2">
          These providers find contact details (emails, phone numbers) for your leads. The system can cascade
          through them automatically.
        </p>
        <div className="space-y-2">
          <ProviderGuide
            name="LeadMagic"
            role="Email and phone enrichment"
            fields={['API Key']}
            steps={[
              'Log in to your LeadMagic account.',
              'Go to Account Settings > API Keys.',
              'Click "Regenerate" to create a new key (or copy the existing one).',
              'Paste the API key into the form.'
            ]}
            links={[
              { label: 'LeadMagic Auth Docs', url: 'https://leadmagic.io/docs/authentication' }
            ]}
          />
          <ProviderGuide
            name="Prospeo"
            role="Email finder and person enrichment"
            fields={['API Key']}
            steps={[
              'Sign up for an account at prospeo.io.',
              'Go to your dashboard at app.prospeo.io/api.',
              'Copy your API key (you can create multiple keys if needed).',
              'Paste the key into the form.'
            ]}
            links={[
              { label: 'Prospeo API Docs', url: 'https://prospeo.io/api' },
              { label: 'Prospeo Dashboard', url: 'https://app.prospeo.io/api' }
            ]}
          />
          <ProviderGuide
            name="Exa"
            role="AI-powered data enrichment"
            fields={['API Key']}
            steps={[
              'Go to the Exa Dashboard at dashboard.exa.ai.',
              'Click "API Keys" in the left sidebar.',
              'Click "Create API Key" and give it a name.',
              'Copy the key immediately — you won\'t be able to see it again.',
              'Paste it into the form.'
            ]}
            links={[
              { label: 'Exa Dashboard', url: 'https://dashboard.exa.ai' },
              { label: 'Exa Quickstart', url: 'https://exa.ai/docs/reference/quickstart' }
            ]}
          />
          <ProviderGuide
            name="RocketReach"
            role="Professional contact lookup and enrichment"
            fields={['API Key']}
            steps={[
              'Log in to your RocketReach account.',
              'Go to your Account Settings at rocketreach.co/account.',
              'Click "Generate New API Key".',
              'Copy the key and paste it into the form.'
            ]}
            links={[
              { label: 'RocketReach Account', url: 'https://rocketreach.co/account' },
              { label: 'API Docs', url: 'https://docs.rocketreach.co/reference/rocketreach-api' }
            ]}
          />
          <ProviderGuide
            name="Wiza"
            role="LinkedIn-based contact enrichment"
            fields={['API Key']}
            steps={[
              'Contact Wiza support at hello@wiza.co (or via in-app chat) to enable API access on your account.',
              'Once enabled, click Settings (under your profile icon).',
              'Click "API" and select an API User.',
              'Click "Generate" to create your key.',
              'Copy and paste it into the form.'
            ]}
            links={[
              { label: 'Wiza API Help', url: 'https://help.wiza.co/en/articles/8392662-wiza-s-api-everything-you-need-to-know' }
            ]}
            notes="API access requires a paid Wiza plan. It is not available on free or trial accounts."
          />
          <ProviderGuide
            name="Forager"
            role="B2B contact and company data enrichment"
            fields={['API Key']}
            steps={[
              'Create a free account at app.forager.ai/sign-up.',
              'Navigate to the API section in your account.',
              'Create a new API key.',
              'Copy the key and paste it into the form.'
            ]}
            links={[
              { label: 'Forager Docs', url: 'https://docs.forager.ai' },
              { label: 'Sign Up', url: 'https://app.forager.ai/sign-up' }
            ]}
          />
          <ProviderGuide
            name="Zeliq"
            role="Email and phone waterfall enrichment"
            fields={['API Key']}
            steps={[
              'Log in to your Zeliq account.',
              'Go to Settings > Integration.',
              'Your API key is already generated — copy it.',
              'Paste it into the form.'
            ]}
            links={[
              { label: 'Zeliq API Key Docs', url: 'https://docs.zeliq.com/docs/create-api-keys' }
            ]}
          />
          <ProviderGuide
            name="ContactOut"
            role="Verified email and direct dial enrichment"
            fields={['API Key']}
            steps={[
              'Visit the ContactOut API page and book a call with their sales team.',
              'Once approved, you will receive an API token.',
              'Paste the token into the API Key field.'
            ]}
            links={[
              { label: 'ContactOut API', url: 'https://contactout.com/api-feature' },
              { label: 'API Reference', url: 'https://api.contactout.com/' }
            ]}
            notes="ContactOut API access requires a sales conversation. There is no self-service key generation."
          />
          <ProviderGuide
            name="DataGM (Datagma)"
            role="Real-time company and person enrichment"
            fields={['API Key']}
            steps={[
              'Sign up at datagma.com.',
              'Go to the API page to get a trial token.',
              'Copy the API key and paste it into the form.'
            ]}
            links={[
              { label: 'Datagma API', url: 'https://datagma.com/api/' }
            ]}
          />
          <ProviderGuide
            name="People Data Labs"
            role="Large-scale person and company enrichment"
            fields={['API Key']}
            steps={[
              'Sign up at peopledatalabs.com/signup.',
              'Once registered, your API key will be available in the dashboard.',
              'Copy the key and paste it into the form.'
            ]}
            links={[
              { label: 'PDL Auth Docs', url: 'https://docs.peopledatalabs.com/docs/authentication' },
              { label: 'Sign Up', url: 'https://www.peopledatalabs.com/signup' }
            ]}
            notes="Free accounts get 100 requests/minute. Paid accounts get 1,000 requests/minute."
          />
        </div>

        {/* -- Outreach / Messaging -- */}
        <SubHeading>Outreach &amp; Messaging</SubHeading>
        <p className="text-xs text-slate-500 mb-2">
          These providers send messages to your experts across different channels.
        </p>
        <div className="space-y-2">
          <ProviderGuide
            name="LinkedIn Messaging (Legacy)"
            role="Legacy LinkedIn outreach token provider"
            fields={['API Key']}
            steps={[
              'Go to the LinkedIn Developer portal at developer.linkedin.com.',
              'Create a new application (or use an existing one).',
              'Under your app settings, generate an API key / access token with messaging permissions.',
              'Copy the key and paste it into the form.'
            ]}
            links={[
              { label: 'LinkedIn Developer Portal', url: 'https://developer.linkedin.com/' }
            ]}
            notes="For sourcing and webhook ingestion, use the LinkedIn Sales Navigator provider with Client ID + Client Secret."
          />
          <ProviderGuide
            name="Email Provider"
            role="Send outreach emails"
            fields={['API Key']}
            steps={[
              'This depends on which email service you use (SendGrid, Mailgun, Amazon SES, etc.).',
              'Log in to your email provider\'s dashboard.',
              'Navigate to API keys or developer settings.',
              'Generate or copy an API key with send permissions.',
              'Paste it into the form.'
            ]}
            notes="The specific steps vary by email provider. Consult your provider's documentation for exact instructions."
          />
          <ProviderGuide
            name="Twilio"
            role="SMS and iMessage outreach"
            fields={['Account SID', 'Auth Token']}
            steps={[
              'Log in to the Twilio Console at twilio.com/console.',
              'On the Dashboard, find the "Account Info" section.',
              'Copy the Account SID.',
              'Click the eye icon next to Auth Token to reveal it, then copy it.',
              'Paste both values into the corresponding fields.'
            ]}
            links={[
              { label: 'Twilio Console', url: 'https://www.twilio.com/console' }
            ]}
            notes="Treat your Auth Token like a password. If compromised, regenerate it immediately from the Twilio console."
          />
          <ProviderGuide
            name="WhatsApp (2Chat)"
            role="Send WhatsApp messages via 2Chat"
            fields={['API Key']}
            steps={[
              'Create a 2Chat account at app.2chat.io/signup if you don\'t have one.',
              'Connect a WhatsApp channel in the Channels section.',
              'Go to the Developers section at app.2chat.io/developers.',
              'Copy the default API key or create a new one.',
              'Paste it into the form.'
            ]}
            links={[
              { label: '2Chat Help', url: 'https://help.2chat.io/en/articles/7830948-where-can-you-find-the-api-key-in-2chat' },
              { label: 'Developer Docs', url: 'https://developers.2chat.co/docs/intro' }
            ]}
          />
          <ProviderGuide
            name="Respond.io"
            role="Multi-channel messaging platform"
            fields={['API Key']}
            steps={[
              'Log in to your Respond.io workspace.',
              'Go to Settings > Integrations.',
              'Search for "Developer API" and click "Edit".',
              'Click "Add Access Token" to generate a new API key.',
              'Copy and paste it into the form.'
            ]}
            links={[
              { label: 'Respond.io Developer API', url: 'https://help.respond.io/l/en/integrations/developer-api' }
            ]}
            notes="Developer API access requires a Growth Plan or above."
          />
          <ProviderGuide
            name="LINE"
            role="Send LINE messages"
            fields={['API Key']}
            steps={[
              'Go to the LINE Developers Console at developers.line.biz.',
              'Create a new provider (or select an existing one).',
              'Create a Messaging API channel.',
              'In the channel settings, scroll to "Channel access token".',
              'Click "Issue" to generate a long-lived channel access token.',
              'Copy and paste the token into the API Key field.'
            ]}
            links={[
              { label: 'LINE Getting Started', url: 'https://developers.line.biz/en/docs/messaging-api/getting-started/' },
              { label: 'Channel Access Token', url: 'https://developers.line.biz/en/docs/basics/channel-access-token/' }
            ]}
          />
          <ProviderGuide
            name="WeChat"
            role="Send WeChat messages"
            fields={['API Key']}
            steps={[
              'Register a WeChat Official Account at mp.weixin.qq.com.',
              'Enable Developer Mode in your account settings.',
              'Complete the Access Guide setup process.',
              'Obtain an access token through the "Getting Access Token" endpoint.',
              'Paste the access token into the API Key field.'
            ]}
            links={[
              { label: 'WeChat Developer Docs', url: 'https://developers.weixin.qq.com/doc/offiaccount/en/Getting_Started/Overview.html' }
            ]}
            notes="WeChat API access requires a verified Official Account. The setup process involves server verification."
          />
          <ProviderGuide
            name="Viber"
            role="Send Viber messages via bot"
            fields={['API Key']}
            steps={[
              'Create a Viber bot (requires an active Viber account on iOS/Android).',
              'In the Viber app, go to More > Settings > Bots.',
              'Open your bot and go to "Edit Info".',
              'Find your authentication token (app key) on this screen.',
              'Copy and paste it into the API Key field.'
            ]}
            links={[
              { label: 'Viber Authentication', url: 'https://creators.viber.com/docs/bots-api/getting-started/authentication' },
              { label: 'Viber REST API', url: 'https://developers.viber.com/docs/api/rest-bot-api/' }
            ]}
            notes="As of February 2024, new bots must be created on commercial terms. You also need to configure a webhook URL."
          />
          <ProviderGuide
            name="Telegram"
            role="Send Telegram messages via bot"
            fields={['Bot Token']}
            steps={[
              'Open Telegram and search for @BotFather.',
              'Start a chat and send the /newbot command.',
              'Choose a name and a username for your bot.',
              'BotFather will reply with a bot token (looks like 1553279091:AAGLECcm23ihHRom...).',
              'Copy the entire token and paste it into the Bot Token field.'
            ]}
            links={[
              { label: 'Telegram Bot Tutorial', url: 'https://core.telegram.org/bots/tutorial' },
              { label: 'BotFather', url: 'https://t.me/BotFather' }
            ]}
            notes="You can register up to 20 bots per Telegram account."
          />
          <ProviderGuide
            name="KakaoTalk"
            role="Send KakaoTalk messages"
            fields={['API Key']}
            steps={[
              'Go to the Kakao Developers console at developers.kakao.com.',
              'Create a new application (or select an existing one).',
              'In the app settings, find your REST API Key.',
              'Copy the key and paste it into the API Key field.'
            ]}
            links={[
              { label: 'Kakao Developers', url: 'https://developers.kakao.com' },
              { label: 'KakaoTalk Message API', url: 'https://developers.kakao.com/docs/latest/en/kakaotalk-message/rest-api' }
            ]}
          />
          <ProviderGuide
            name="Voicemail Drop"
            role="Drop pre-recorded voicemails"
            fields={['API Key']}
            steps={[
              'Log in to your voicemail drop service provider\'s dashboard.',
              'Navigate to developer settings or API keys.',
              'Generate or copy your API key.',
              'Paste it into the form.'
            ]}
            notes="The exact steps depend on which voicemail drop service you use. Consult your provider's documentation."
          />
        </div>

        {/* -- Phone Calls -- */}
        <SubHeading>Phone Calls</SubHeading>
        <div className="space-y-2">
          <ProviderGuide
            name="Yay"
            role="Outbound phone calls with call validation"
            fields={['API Key', 'Webhook Secret']}
            steps={[
              'Log in to your Yay.com account dashboard.',
              'Navigate to the API / developer settings.',
              'Copy your API key.',
              'Set up a webhook for call events and copy the webhook secret.',
              'Paste both values into the corresponding fields.'
            ]}
            notes="Yay validates call duration (minimum 5 seconds) for fraud detection. The webhook secret is used to verify incoming call event payloads."
          />
        </div>

        {/* -- Data Sync -- */}
        <SubHeading>Data Sync</SubHeading>
        <div className="space-y-2">
          <ProviderGuide
            name="Google Sheets"
            role="Sync verified data (phone numbers, signups, screening results) to Google Sheets"
            fields={['Spreadsheet ID', 'Service Account JSON']}
            steps={[
              'Go to the Google Cloud Console at console.cloud.google.com.',
              'Create a new project (or select an existing one).',
              'Go to APIs & Services > Library. Search for and enable both "Google Sheets API" and "Google Drive API".',
              'Go to APIs & Services > Credentials. Click "Create Credentials" > "Service Account".',
              'Give the service account a name and complete the setup.',
              'On the service account detail page, go to the "Keys" tab. Click "Add Key" > "Create new key" > select JSON.',
              'A JSON file will download — paste its entire contents into the "Service Account JSON" field.',
              'Open your target Google Sheet. Click "Share" and add the service account email (found in the JSON file as "client_email") with Editor access.',
              'Copy the Spreadsheet ID from the Sheet URL. It\'s the long string between /d/ and /edit (e.g. in https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit, the ID is 1BxiMVs0XRA5...).',
              'Paste the Spreadsheet ID into the form.'
            ]}
            links={[
              { label: 'Google Cloud Console', url: 'https://console.cloud.google.com/' },
              { label: 'Create Credentials Guide', url: 'https://developers.google.com/workspace/guides/create-credentials' }
            ]}
            notes="The service account email must have Editor access to the spreadsheet. Without this, the sync will fail with a permission error."
          />
          <ProviderGuide
            name="Supabase"
            role="Export enriched leads to a Supabase table"
            fields={['Project URL', 'Service Role Key', 'Schema', 'Table Name', 'Column Mappings (Email, Phone, Country, Company, LinkedIn, Job Title)']}
            steps={[
              'Log in to your Supabase project at app.supabase.com.',
              'Go to Project Settings > API. Copy the Project URL (e.g. https://xyz.supabase.co).',
              'On the same page, copy the service_role key (under "Project API keys"). This key has full table access.',
              'Create the target table in Supabase with the columns you need (for example email, phone, country, company, linkedin, title).',
              'Enter the table name and optionally a schema (defaults to "public").',
              'Under Column Mapping, enter the exact column names in your Supabase table for email, phone, country, current company, LinkedIn URL, and job title. Leave blank to use defaults (primary_email, primary_phone, country_iso, company_name, linkedin_url, job_title).'
            ]}
            links={[
              { label: 'Supabase Dashboard', url: 'https://app.supabase.com' },
              { label: 'Supabase API Docs', url: 'https://supabase.com/docs/guides/api' }
            ]}
            notes="The service_role key bypasses Row Level Security. Keep it secret. Only the visible mapped fields are exported, so your Supabase table only needs the columns you configure here."
          />
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 5 — COMMON WORKFLOWS                                       */}
      {/* ------------------------------------------------------------------ */}
      <Card className="space-y-4">
        <SectionHeading id="workflows">Common Workflows</SectionHeading>

        <SubHeading>Set up a new project from scratch</SubHeading>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
          <li><strong>Configure your provider accounts first.</strong> Go to the Providers page, add API keys for the services you need (enrichment, messaging, calling, data sync).</li>
          <li><strong>Create a new project via the wizard.</strong> Go to Projects, click &quot;New Project&quot;. Step 1: Project details (name, target, geography). Step 2: Lead sources (Apollo, Sales Nav, enrichment providers). Step 3: Export destinations (Google Sheets, Supabase). Step 4: Outreach (select healthy channels and write a message template with variables like {`{{FirstName}}`}, {`{{Country}}`}). Step 5: Review and start prospecting.</li>
          <li><strong>The auto-sourcing engine takes over.</strong> The system automatically queues enrichment and outreach for your leads every 5 minutes until the target is reached.</li>
          <li><strong>Monitor progress.</strong> Use the Dashboard for overview, Leads page for pipeline status, and Outreach page for messaging activity.</li>
        </ol>

        <SubHeading>Connect your first provider</SubHeading>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
          <li>Navigate to the <strong>Providers</strong> page from the sidebar.</li>
          <li>Select the <strong>Provider Type</strong> from the dropdown (e.g. APOLLO, LEADMAGIC, TWILIO).</li>
          <li>Enter an <strong>Account Label</strong> to identify this account (e.g. &quot;Production&quot;, &quot;Staging&quot;, &quot;Team-A&quot;).</li>
          <li>Fill in the <strong>credential fields</strong> that appear below. See the Provider Setup Guides above for how to obtain each credential.</li>
          <li>Click <strong>Create Provider Account</strong>. Your credentials are encrypted immediately.</li>
          <li>Optionally, click <strong>Test Connection</strong> on the new account card to verify the API key works.</li>
        </ol>

        <SubHeading>Monitor your outreach</SubHeading>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
          <li>Go to the <strong>Outreach</strong> page from the sidebar.</li>
          <li>Use the filters to narrow by project, channel, or thread status (Open, Closed, Archived).</li>
          <li>Click on a thread to see the full conversation history, including sent messages and any replies.</li>
          <li>Check the Dashboard activity feed for a real-time view of outreach events across all projects.</li>
        </ol>

        <SubHeading>Manage users and roles</SubHeading>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
          <li>Go to the <strong>Users</strong> page (admins only).</li>
          <li>Click <strong>Add User</strong>, then provide email, name, password, role, and timezone.</li>
          <li>Use the edit action to update role or reset credentials for existing users.</li>
          <li>Use delete to remove access (except your own currently authenticated account).</li>
        </ol>

        <SubHeading>Update your profile and password</SubHeading>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
          <li>Open the avatar menu in the top-right corner.</li>
          <li>Select <strong>Settings</strong>.</li>
          <li>Edit your name, and optionally set a new password.</li>
          <li>Enter your current password when changing to a new one, then save.</li>
        </ol>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 6 — FAQ / TROUBLESHOOTING                                  */}
      {/* ------------------------------------------------------------------ */}
      <Card className="space-y-4">
        <SectionHeading id="faq">FAQ &amp; Troubleshooting</SectionHeading>
        <div className="space-y-2">
          {[
            {
              q: 'I see "An unexpected error occurred"',
              a: 'This usually means the server encountered an issue it wasn\'t expecting. Check the browser\'s developer console (F12 > Console) for more details. If the error persists, contact your system administrator with the correlation ID from the response headers.'
            },
            {
              q: 'I can\'t create a provider account',
              a: 'Provider management requires admin-level access. Make sure you are signed in with an account that has permission to manage providers, and that all required credential fields are filled in for the selected provider type.'
            },
            {
              q: 'What does "encrypted at rest" mean?',
              a: 'When you save API keys, they are encrypted using AES-256-GCM (a military-grade encryption standard) before being stored in the database. The raw key is never stored. It\'s only decrypted at the exact moment it\'s needed to call the provider\'s API, and it never appears in logs or API responses.'
            },
            {
              q: 'How do I bind a provider to a project?',
              a: 'Go to the Projects page and create or edit a project. In the project wizard (Step 2: Lead Sources), you can select which provider accounts to use for that project via the checkboxes grid.'
            },
            {
              q: 'My provider shows "unhealthy" status',
              a: 'Click "Test Connection" on the provider card to re-check. Common causes: the API key has expired, the provider account has been deactivated on the provider\'s side, or rate limits have been exceeded. Try regenerating the key from the provider\'s dashboard and updating the credentials.'
            },
            {
              q: 'What happens if enrichment fails for a lead?',
              a: 'The system automatically tries the next enrichment provider in the cascade. If all providers fail, the lead remains in "Enriching" status. Failed attempts are logged and visible in the Observability page. You can also check the dead-letter queue for persistent failures.'
            },
            {
              q: 'Can I use the same provider account across multiple projects?',
              a: 'Yes. A single provider account (e.g. one Apollo API key) can be bound to multiple projects. The system handles rate limiting and rotation automatically.'
            },
            {
              q: 'Why can\'t I select two provider accounts of the same type in a project?',
              a: 'Projects allow one bound account per provider type (for example one APOLLO account and one LEADMAGIC account). In the project wizard and project edit pages, selecting a second account of the same type automatically replaces the previous selection.'
            },
            {
              q: 'How do I deactivate a provider without deleting it?',
              a: 'On the Providers page, find the provider card and click "Deactivate". The account remains in the system but won\'t be used for any operations. You can reactivate it later by clicking "Activate".'
            },
            {
              q: 'How does the auto-sourcing engine work?',
              a: 'Every 5 minutes, the system checks all active projects. For projects that haven\'t reached their target expert count, it automatically queues enrichment for new leads and outreach for enriched leads. If no leads have been processed in 24 hours, the system creates a stalled pipeline alert.'
            },
            {
              q: 'Why is my outreach going to a different channel than I selected?',
              a: 'The system respects the expert\'s preferred channel. If an expert previously replied via WhatsApp, future messages will be sent via WhatsApp regardless of the channel you select — as long as the project has a WhatsApp provider bound. This ensures conversation continuity.'
            },
            {
              q: 'Do I need to write outreach messages manually?',
              a: 'No. You write a message template once during project creation (Step 4 — Outreach). The template supports variables like {{FirstName}}, {{Country}}, {{JobTitle}}, and {{CurrentCompany}}. After each lead is enriched, the system automatically resolves the template and sends outreach through your configured channels.'
            },
            {
              q: 'How do I change my password?',
              a: 'Open the avatar menu in the header, click "Settings", and fill in Current Password + New Password + Confirm New Password. Password updates require the current password for verification.'
            },
            {
              q: 'Why does project setup show no providers to select?',
              a: 'The project wizard only shows active provider accounts with saved credentials. First add provider accounts on the Providers page, then return to the project wizard. If an account appears unhealthy, use "Test Connection" and update credentials if needed.'
            }
          ].map((item) => (
            <details key={item.q} className="group border border-slate-200 rounded-lg">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-lg select-none">
                <span>{item.q}</span>
                <span className="material-symbols-outlined ml-2 text-slate-400 text-lg transition-transform group-open:rotate-180 shrink-0">
                  expand_more
                </span>
              </summary>
              <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </Card>

      {/* Back to top */}
      <div className="text-center pb-8">
        <a href="#overview" className="text-xs text-slate-400 hover:text-primary transition-colors">
          Back to top
        </a>
      </div>
    </div>
  );
}
