Perfect.

Below is a massive, production-grade scaffold file for your first commit.

This file is not code — it is a system blueprint + execution contract + architecture declaration that Codex 5.3 High will read before entering planning mode.

It is intentionally extremely detailed so that:
	•	There is zero ambiguity.
	•	All modules are declared.
	•	All domain rules are fixed.
	•	All system invariants are defined.
	•	Codex cannot simplify scope.
	•	Codex cannot “interpret loosely”.
	•	Codex must build everything.

You will place this file at:

/docs/ARCHITECTURE_MASTER_SPECIFICATION.md

Commit this as the very first commit.

⸻

📄 ARCHITECTURE_MASTER_SPECIFICATION.md

⸻

EXPERT SOURCING AUTOMATION PLATFORM

Master System Specification

Version 1.0
Status: Production Build
Authority: Signed Agreement (SECOND – SCOPE OF SERVICES)

⸻

1. SYSTEM PURPOSE

This system is a deterministic, queue-driven, multi-channel expert sourcing and outreach automation platform.

This is a production-grade commercial automation system.

This is NOT:
	•	A prototype
	•	A best-effort system
	•	A partial implementation
	•	A mock architecture
	•	A SaaS template
	•	An MVP

This system must be:
	•	Fully deterministic
	•	Fully functional
	•	Fully integrated
	•	Fully documented
	•	Fully testable
	•	Fully production-ready

After implementation, only environment variables and database migrations should be required.

⸻

2. TECHNOLOGY STACK (MANDATORY)

Backend:
	•	Node.js (LTS)
	•	TypeScript (strict mode enabled)
	•	Express or Fastify
	•	Prisma ORM
	•	PostgreSQL
	•	BullMQ (Redis-backed queue system)
	•	Zod validation
	•	Pino logger
	•	Dockerized
	•	ESLint + Prettier configured

AI:
	•	OpenAI API (low temperature deterministic logic)

Infrastructure assumptions:
	•	Redis required
	•	PostgreSQL required
	•	All external integrations must be production-ready

⸻

3. SYSTEM ARCHITECTURE OVERVIEW

System is divided into modules:

/src
  /api
  /modules
    /projects
    /job-title-engine
    /sales-nav
    /lead-ingestion
    /enrichment
    /cooldown
    /outreach
    /screening
    /ranking
    /call-allocation
    /call-validation
    /performance-engine
    /google-sheets-sync
  /queues
  /integrations
  /core
  /db
  /config

All modules must be independent, testable, and idempotent.

⸻

4. DOMAIN MODEL DECLARATION

Entities:

Project
Company
JobTitle
SalesNavSearch
Lead
Expert
ExpertContact
EnrichmentAttempt
OutreachThread
OutreachMessage
ScreeningQuestion
ScreeningResponse
CallTask
CallLog
Caller
CallerPerformanceMetric
RankingSnapshot
CooldownLog
GoogleSheetExport
SystemEvent

All relationships must be strictly enforced via foreign keys.

⸻

5. CORE SYSTEM INVARIANTS

These rules are absolute and must never be violated:
	1.	No expert may be contacted twice within 30 days unless override flag enabled.
	2.	All enrichment attempts must be logged.
	3.	All outbound messages must be stored.
	4.	All inbound replies must be stored.
	5.	Every call must be validated via Yay.com logs.
	6.	No call task may exist without associated expert.
	7.	No expert may be assigned to a caller outside their language + geography.
	8.	No caller may receive more than one task simultaneously.
	9.	If a caller misses execution window → immediate reallocation.
	10.	Project cannot stop sourcing until target threshold met.

⸻

6. JOB TITLE DISCOVERY ENGINE

Inputs:
	•	Target companies
	•	Geography
	•	Sector filters

Flow:
	1.	Query Apollo API
	2.	Extract current + former titles
	3.	Normalize titles
	4.	Deduplicate
	5.	Pass to OpenAI for expansion
	6.	Score relevance
	7.	Persist titles with score
	8.	Log AI reasoning

Output:
Validated job title list per project.

⸻

7. SALES NAVIGATOR INGESTION

Requirements:
	•	Minimum 6 URLs per project
	•	URL validation
	•	Metadata extraction
	•	Pagination handling
	•	Queue job per search

No manual parsing.

⸻

8. ENRICHMENT ENGINE (MULTI-PROVIDER ORCHESTRATION)

Providers:
	•	LeadMagic
	•	Prospeo
	•	Exa.ai
	•	RocketReach
	•	Wiza
	•	Forager
	•	Zeliq
	•	ContactOut
	•	Datagm
	•	People Data Labs

Must implement:

Parallel + sequential strategy:

Step 1: Parallel enrichment batch
Step 2: Collect results
Step 3: Validate emails
Step 4: Validate phones
Step 5: Confidence scoring
Step 6: Fallback if below threshold

Must log:
	•	Provider used
	•	Attempt time
	•	Response
	•	Errors
	•	Rate limit events

No enrichment may be discarded silently.

⸻

9. COOLDOWN SYSTEM

Rolling 30-day cooldown.

Applies across:
	•	Email
	•	LinkedIn
	•	SMS
	•	WhatsApp
	•	Calls
	•	Any other channel

Must be enforced BEFORE sending any outreach.

⸻

10. OUTREACH ENGINE

Channels supported:
	•	LinkedIn
	•	Email
	•	WhatsApp (2chat)
	•	respond.io
	•	SMS / iMessage
	•	LINE
	•	WeChat
	•	Viber
	•	Telegram

Rules:

If expert replies on channel X:
Continue on X.

Regional email logic:
Canada / UK / Europe / Australia:
Professional emails first.

Other regions:
Professional + personal allowed.

All messaging must:
	•	Be logged
	•	Be thread-linked
	•	Be idempotent
	•	Support retries

⸻

11. SCREENING ENGINE

Per-project custom screening questions.

Flow:
	1.	Send questions via preferred channel
	2.	Collect answers
	3.	Persist responses
	4.	If incomplete:
	•	Auto follow-up
	•	Escalate to call engine if necessary

⸻

12. ONGOING LEAD EXPANSION

System must continue sourcing until:

Registered experts with completed screening ≥ target threshold.

Threshold is configurable per project.

No manual stopping.

⸻

13. AUTONOMOUS CALL ALLOCATION ENGINE

Core rules:
	•	Global pool of callable experts.
	•	Real-time allocation.
	•	One task at a time per caller.
	•	Strict execution timer.
	•	Auto cancellation if missed.
	•	Auto reallocation.

Matching constraints:
	•	Language
	•	Geography
	•	Timezone

Callers cannot:
	•	Browse leads
	•	Skip leads
	•	Reprioritize

⸻

14. CALL VALIDATION & FRAUD DETECTION

Integrate Yay.com:

Minimum duration:
5 seconds for valid connection.

If:
Caller logs connected call < 5 sec
→ Reallocate expert
→ Restrict caller

Repeated violations:
Automatic suspension.

⸻

15. PERFORMANCE ENGINE

Requirement:
30 dials per hour per caller.

If below:
Stop assigning tasks.

Performance metrics must:
	•	Be stored
	•	Be recalculated hourly
	•	Affect ranking priority

⸻

16. RANKING ENGINE

Priority order:
	1.	Fresh replies (highest priority projects)
	2.	Signup chasers
	3.	High-value rejected experts
	4.	Projects with lowest % completion

Must calculate:

Completion % = signed_up / target_required

Projects with lower % get higher ranking weight.

Weighted scoring system must be implemented.

⸻

17. ZERO IDLE ENFORCEMENT

If:
Caller inactive
Missed log
Underperformance

Immediate reallocation.

No idle experts allowed.

⸻

18. GOOGLE SHEETS SYNC

Sync:
	•	Verified phone numbers
	•	Signup counts
	•	Screening completion

Must:
	•	Batch writes
	•	Handle rate limits
	•	Retry failures

⸻

19. DOCUMENTATION REQUIREMENTS

Auto-generate:
	•	Architecture overview
	•	Module documentation
	•	ENV variable reference
	•	Migration instructions
	•	Deployment instructions
	•	Handover guide

No undocumented module allowed.

⸻

20. TESTING REQUIREMENTS

Minimum:
	•	70% unit coverage
	•	Integration tests:
	•	Enrichment flow
	•	Cooldown enforcement
	•	Call allocation
	•	Ranking engine
	•	Screening completion

No untested core logic.

⸻

21. NON-FUNCTIONAL REQUIREMENTS
	•	Strict TypeScript
	•	Central error handling
	•	Health endpoint
	•	Graceful shutdown
	•	Idempotency keys
	•	Concurrency safe
	•	Structured logs
	•	Dockerfile included
	•	No TODO comments

⸻

22. FINAL ACCEPTANCE CONDITION

System is complete when:
	•	All modules implemented
	•	All integrations live
	•	No mock services
	•	No placeholders
	•	All tests passing
	•	No runtime warnings
	•	No unhandled promises
	•	Full documentation generated

After adding keys to .env:
System runs fully.

⸻

END OF SPECIFICATION

⸻