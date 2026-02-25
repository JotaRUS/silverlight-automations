# Expert Sourcing Automation Platform — Frontend Developer Manual

This manual is written for frontend developers building a web application that consumes the platform's REST API. It maps every backend capability to screens, user flows, components, and integration patterns.

---

## Table of Contents

1. [API Integration Fundamentals](#1-api-integration-fundamentals)
2. [Authentication Flow](#2-authentication-flow)
3. [Application Screens by Role](#3-application-screens-by-role)
4. [Screen Specifications](#4-screen-specifications)
   - [Login](#41-login)
   - [Dashboard](#42-dashboard)
   - [Projects](#43-projects)
   - [Project Detail](#44-project-detail)
   - [Callers](#45-callers)
   - [Caller Detail & Performance](#46-caller-detail--performance)
   - [Call Tasks — Caller View](#47-call-tasks--caller-view)
   - [Call Tasks — Operator View](#48-call-tasks--operator-view)
   - [Outreach](#49-outreach)
   - [Screening](#410-screening)
   - [Job Title Discovery](#411-job-title-discovery)
   - [Documentation Generator](#412-documentation-generator)
5. [Error Handling Patterns](#5-error-handling-patterns)
6. [Polling & Real-Time Data](#6-polling--real-time-data)
7. [State Machine UI Patterns](#7-state-machine-ui-patterns)
8. [CORS & Security](#8-cors--security)
9. [Suggested Tech Stack](#9-suggested-tech-stack)
10. [API Quick Reference](#10-api-quick-reference)

---

## 1. API Integration Fundamentals

### Base URL

```
http://localhost:3000
```

All API routes are prefixed with `/api/v1`. Webhook routes use `/webhooks`.

### Required Headers

Every request that sends a JSON body must include:

```
Content-Type: application/json
```

Every authenticated request must include:

```
Authorization: Bearer <token>
```

### Correlation IDs

For traceability, send a unique ID with each request:

```
x-correlation-id: <uuid>
```

If omitted, the server generates one. Store this from the response headers to help with debugging and support tickets.

### Rate Limiting

The API enforces **300 requests per 60 seconds** globally. When exceeded, the server responds with `429 Too Many Requests`. Your frontend should:

- Show a "too many requests" toast/message.
- Implement exponential backoff on retries.
- Debounce rapid user actions (button clicks, search inputs).

### Request Size

Maximum request body: **1 MB**. This is relevant for bulk operations like attaching companies or Sales Nav searches.

---

## 2. Authentication Flow

The platform uses stateless JWT tokens with three roles. There is no session management server-side — all state is in the token.

### Login Flow

```
┌─────────────┐      POST /api/v1/auth/token       ┌─────────────┐
│  Login Form │  ─────────────────────────────────► │   Backend   │
│  userId     │                                     │             │
│  role       │  ◄─────────────────────────────────  │  Returns:   │
└─────────────┘    { accessToken, tokenType }        │  JWT token  │
                                                     └─────────────┘
```

**Request:**

```typescript
const response = await fetch('/api/v1/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user@company.com', role: 'admin' })
});

const { accessToken } = await response.json();
```

**Token storage options:**

| Method          | Pros                        | Cons                         |
|-----------------|-----------------------------|------------------------------|
| `localStorage`  | Persists across tabs        | Vulnerable to XSS            |
| `sessionStorage`| Cleared on tab close        | Lost on new tab              |
| HTTP-only cookie| Immune to XSS              | Requires proxy/BFF setup     |
| In-memory state | Safest from XSS             | Lost on refresh              |

**Recommended:** Store in memory (React context/Zustand/Redux) + `sessionStorage` as fallback for page refreshes.

### Token Expiration

Tokens expire after **3600 seconds** (1 hour) by default. Your frontend should:

1. Decode the JWT to read the `exp` claim.
2. Set a timer to refresh the token ~5 minutes before expiry.
3. On 401 responses, redirect to login.

```typescript
function isTokenExpired(token: string): boolean {
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.exp * 1000 < Date.now();
}
```

### Verify Current Session

```
GET /api/v1/auth/me
Authorization: Bearer <token>
```

Returns `{ userId, role }`. Call this on app load to validate the stored token.

### Role-Based Access

| Role     | Can access                                                           |
|----------|----------------------------------------------------------------------|
| `admin`  | Everything                                                           |
| `ops`    | Projects, Callers, Outreach, Screening, Call Tasks (operator), Job Title Discovery, Docs |
| `caller` | Call Tasks (own current task + outcome submission only)               |

**Frontend routing guard pattern:**

```typescript
const ROLE_ROUTES = {
  admin: ['*'],
  ops: ['/projects', '/callers', '/outreach', '/screening', '/call-tasks/operator', '/job-titles', '/docs'],
  caller: ['/call-tasks/mine']
};

function canAccess(role: string, path: string): boolean {
  const allowed = ROLE_ROUTES[role];
  return allowed.includes('*') || allowed.some(r => path.startsWith(r));
}
```

---

## 3. Application Screens by Role

### Admin / Ops Layout

```
┌──────────────────────────────────────────────────────┐
│  Sidebar Navigation              │  Main Content     │
│                                  │                   │
│  ▸ Dashboard                     │                   │
│  ▸ Projects                      │  (active screen)  │
│  ▸ Callers                       │                   │
│  ▸ Call Tasks                    │                   │
│  ▸ Outreach                      │                   │
│  ▸ Screening                     │                   │
│  ▸ Job Title Discovery           │                   │
│  ▸ Documentation                 │                   │
│                                  │                   │
│  ─────────────                   │                   │
│  User: admin-1                   │                   │
│  Role: admin                     │                   │
│  [Logout]                        │                   │
└──────────────────────────────────────────────────────┘
```

### Caller Layout

```
┌──────────────────────────────────────────────────────┐
│  Header: Expert Sourcing Platform    [Logout]        │
├──────────────────────────────────────────────────────┤
│                                                      │
│              Current Call Task Card                   │
│              ┌─────────────────────┐                 │
│              │ Expert: Jane Doe    │                 │
│              │ Company: Stripe     │                 │
│              │ Title: VP Eng       │                 │
│              │ Phone: +1...        │                 │
│              │                     │                 │
│              │ [Interested] [Retry] [Never Contact]  │
│              └─────────────────────┘                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 4. Screen Specifications

### 4.1 Login

**Purpose:** Authenticate and obtain a JWT token.

**API call:**

```
POST /api/v1/auth/token
Body: { "userId": "<input>", "role": "<select>" }
```

**UI elements:**

- Text input: User ID / email
- Dropdown: Role (`admin`, `ops`, `caller`)
- Submit button: "Sign In"
- Error display area

**On success:** Store token, redirect based on role:
- `admin` / `ops` → Dashboard
- `caller` → Call Task screen

**On error (400):** Show validation message from `error.details`.

---

### 4.2 Dashboard

**Purpose:** At-a-glance overview. Calls system endpoints on load.

**API calls:**

```
GET /api/v1/system/health
GET /api/v1/system/ready
```

**Suggested widgets:**

| Widget                | Data source                              | Display          |
|-----------------------|------------------------------------------|------------------|
| System Status         | `/system/health` + `/system/ready`       | Green/red badges |
| Active Projects Count | Cached from project list                 | Number card      |
| Pending Tasks         | `/call-tasks/operator/tasks?status=PENDING&limit=1` | Number card |
| Active Callers        | Cached from callers list                 | Number card      |

---

### 4.3 Projects

**Purpose:** List, create, and manage sourcing projects.

#### Project List

**API call:**

There is no dedicated list endpoint. Projects are accessed individually by ID. For a list view, consider:
- Maintaining a local list of project IDs.
- Or querying the database through a future list endpoint.

#### Create Project

**API call:**

```
POST /api/v1/projects
```

**Form fields:**

| Field               | Input type      | Validation               | Required |
|---------------------|-----------------|--------------------------|----------|
| Name                | Text input      | Min 1 character          | Yes      |
| Description         | Textarea        | —                        | No       |
| Target Threshold    | Number input    | Positive integer         | Yes      |
| Geography ISO Codes | Multi-select/tags | 2-char ISO codes, min 1 | Yes      |
| Priority            | Number input    | Min 0                    | No       |
| Override Cooldown   | Checkbox        | —                        | No       |

**On success (201):** Save returned `id`, navigate to project detail.

#### Get Project

```
GET /api/v1/projects/:projectId
```

#### Update Project

```
PATCH /api/v1/projects/:projectId
Body: partial fields
```

Use an inline edit or modal pattern. Only send changed fields.

---

### 4.4 Project Detail

**Purpose:** Full management of a single project — companies, searches, screening questions.

**Tabs or sections:**

```
┌─────────────────────────────────────────────────┐
│ Project: APAC Fintech Experts Q1                │
│ Status: ACTIVE    Target: 50    Signed up: 12   │
├──────┬───────────┬─────────────┬────────────────┤
│ Info │ Companies │ Sales Nav   │ Screening Qs   │
└──────┴───────────┴─────────────┴────────────────┘
```

#### Companies Tab

**List:** Rendered from project data (no separate list endpoint).

**Add companies:**

```
POST /api/v1/projects/:projectId/companies
Body: { "companies": [ { "name": "...", "domain": "...", "countryIso": "..." }, ... ] }
```

**Form:** Table with rows (name, domain, country). "Add Row" button. "Save All" button submits the batch.

#### Sales Nav Searches Tab

**Add searches:**

```
POST /api/v1/projects/:projectId/sales-nav-searches
Body: { "searches": [ { "sourceUrl": "...", "normalizedUrl": "..." }, ... ] }
```

Minimum **6 searches** required. Show a counter: "4/6 minimum searches added".

**Form:** Repeating rows with URL inputs. Validate URLs client-side.

#### Screening Questions Tab

**List questions:**

```
GET /api/v1/projects/:projectId/screening-questions
```

**Create question:**

```
POST /api/v1/projects/:projectId/screening-questions
Body: { "prompt": "...", "displayOrder": 1, "required": true }
```

**Update question:**

```
PATCH /api/v1/projects/:projectId/screening-questions/:questionId
Body: partial fields
```

**UI pattern:** Sortable list with drag-and-drop for `displayOrder`. Inline edit for prompt text. Toggle for `required`.

---

### 4.5 Callers

**Purpose:** Manage phone agent profiles.

#### Caller List

No dedicated list endpoint exists. Consider maintaining a client-side registry or building a list endpoint.

#### Register a Caller

```
POST /api/v1/callers
```

**Form fields:**

| Field            | Input type        | Validation                     | Required |
|------------------|-------------------|--------------------------------|----------|
| Email            | Email input       | Valid email format, unique      | Yes      |
| Name             | Text input        | Min 1 character                 | Yes      |
| Timezone         | Timezone picker   | IANA timezone string            | Yes      |
| Language Codes   | Multi-select/tags | Min 1 item, each min 2 chars    | Yes      |
| Region ISO Codes | Multi-select/tags | Min 1 item, each exactly 2 chars| Yes      |

**On success (201):** Save `id`, navigate to caller detail.

#### Get / Update Caller

```
GET /api/v1/callers/:callerId
PATCH /api/v1/callers/:callerId
```

---

### 4.6 Caller Detail & Performance

**Purpose:** View caller profile and real-time performance metrics.

**API call:**

```
GET /api/v1/callers/:callerId/performance/latest
```

**Performance dashboard layout:**

```
┌────────────────────────────────────────────────┐
│ Caller: John Smith                             │
│ Status: ACTIVE  ●                              │
├────────────────────────────────────────────────┤
│                                                │
│  Dials/hr     Connections/hr     Short calls   │
│  ┌─────┐      ┌─────┐           ┌─────┐       │
│  │  28 │      │  12 │           │   1 │       │
│  └─────┘      └─────┘           └─────┘       │
│                                                │
│  Performance Score: 85/100                     │
│  ████████████████████░░░░                      │
│                                                │
│  Allocation Status: ACTIVE                     │
│  Grace Mode: No                                │
│                                                │
└────────────────────────────────────────────────┘
```

**Key metrics to display:**

| Field                            | Display as              |
|----------------------------------|-------------------------|
| `rolling60MinuteDials`           | Large number            |
| `rolling60MinuteConnections`     | Large number            |
| `rolling60MinuteValidConnections`| Large number            |
| `shortCallsLastHour`             | Warning if > 0          |
| `allocationStatus`               | Color-coded badge       |
| `performanceScore`               | Progress bar            |
| `graceModeActive`                | Boolean indicator       |

**Status badge colors:**

| Status                    | Color  |
|---------------------------|--------|
| `ACTIVE`                  | Green  |
| `WARMUP_GRACE`            | Blue   |
| `AT_RISK`                 | Yellow |
| `PAUSED_LOW_DIAL_RATE`    | Orange |
| `IDLE_NO_AVAILABLE_TASKS` | Gray   |
| `RESTRICTED_FRAUD`        | Red    |
| `SUSPENDED`               | Red    |

**Polling:** Refresh every **30 seconds** while on this screen.

---

### 4.7 Call Tasks — Caller View

**Purpose:** Simple interface for phone agents. Shows one task at a time.

This is the **only screen** a caller-role user sees.

#### Get Current Task

```
GET /api/v1/call-tasks/current
Authorization: Bearer <callerToken>
```

**States:**

1. **Task assigned** — Show expert info + outcome buttons.
2. **No task available** — Show "No tasks available. Waiting..." with auto-poll.

#### Task Card

```
┌──────────────────────────────────────┐
│  Expert: Jane Doe                    │
│  Company: Stripe                     │
│  Title: VP of Engineering            │
│  Region: US                          │
│  ─────────────────────────────────── │
│  Project: APAC Fintech Experts       │
│  Priority Score: 85                  │
│  ─────────────────────────────────── │
│                                      │
│  ┌──────────────┐  ┌─────────────┐  │
│  │ ✓ Interested │  │ ↻ Retry     │  │
│  └──────────────┘  └─────────────┘  │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ ✕ Never Contact Again       │   │
│  └──────────────────────────────┘   │
│                                      │
└──────────────────────────────────────┘
```

#### Submit Outcome

```
POST /api/v1/call-tasks/:taskId/outcome
Authorization: Bearer <callerToken>
Body: { "outcome": "<value>" }
```

**Outcome values and UI:**

| Value                          | Button label          | Button style       | Confirmation? |
|--------------------------------|-----------------------|--------------------|---------------|
| `INTERESTED_SIGNUP_LINK_SENT`  | "Interested"          | Green / primary    | No            |
| `RETRYABLE_REJECTION`          | "Retry Later"         | Yellow / secondary | No            |
| `NEVER_CONTACT_AGAIN`          | "Never Contact Again" | Red / destructive  | Yes (modal)   |

**After submission:** Show success toast, then immediately fetch the next task.

**Polling:** If no task is assigned, poll `GET /call-tasks/current` every **10 seconds**.

---

### 4.8 Call Tasks — Operator View

**Purpose:** Operators monitor and manage all call tasks across the system.

#### Task List with Filters

```
GET /api/v1/call-tasks/operator/tasks?status=PENDING&projectId=<uuid>&limit=20
Authorization: Bearer <token>
```

**Filter bar:**

| Filter    | Input type | Options                                      |
|-----------|------------|----------------------------------------------|
| Status    | Dropdown   | All, PENDING, ASSIGNED, DIALING, COMPLETED   |
| Project   | Dropdown   | List of known projects                        |
| Limit     | Number     | 1–100 (default 20)                            |

**Table columns:**

| Column         | Source field     | Notes                   |
|----------------|-----------------|-------------------------|
| Task ID        | `id`            | Truncated UUID          |
| Expert         | `expertId`      | Link to expert          |
| Project        | `projectId`     | Link to project         |
| Status         | `status`        | Color-coded badge       |
| Caller         | `callerId`      | Link to caller (if set) |
| Priority       | `priorityScore` | Sort indicator          |
| Assigned At    | `assignedAt`    | Relative time           |
| Outcome        | `callOutcome`   | If completed            |

**Task status badges:**

| Status      | Color  |
|-------------|--------|
| `PENDING`   | Gray   |
| `ASSIGNED`  | Blue   |
| `DIALING`   | Yellow |
| `COMPLETED` | Green  |
| `EXPIRED`   | Orange |
| `CANCELLED` | Red    |
| `RESTRICTED`| Red    |

#### Requeue Action

```
POST /api/v1/call-tasks/operator/tasks/:taskId/requeue
Body: { "reason": "optional reason" }
```

**UI:** "Requeue" button on each row (for ASSIGNED/DIALING tasks). Opens a small modal with an optional reason textarea.

---

### 4.9 Outreach

**Purpose:** Send messages to experts through any of 13 channels.

```
POST /api/v1/outreach/send
```

**Form layout:**

```
┌──────────────────────────────────────────────┐
│  Send Outreach Message                       │
│                                              │
│  Project:    [ Select project      ▼ ]       │
│  Expert:     [ Select expert       ▼ ]       │
│  Channel:    [ EMAIL               ▼ ]       │
│  Recipient:  [ expert@example.com    ]       │
│  Message:                                    │
│  ┌────────────────────────────────────┐      │
│  │                                    │      │
│  │                                    │      │
│  └────────────────────────────────────┘      │
│  ☐ Override 30-day cooldown                  │
│                                              │
│           [ Send Message ]                   │
└──────────────────────────────────────────────┘
```

**Channel dropdown values:**

`PHONE`, `EMAIL`, `LINKEDIN`, `WHATSAPP`, `RESPONDIO`, `SMS`, `IMESSAGE`, `LINE`, `WECHAT`, `VIBER`, `TELEGRAM`, `KAKAOTALK`, `VOICEMAIL`

**On success (202):** Show toast: "Message queued for delivery" with the returned `jobId`.

**Cooldown warning:** If the expert has been contacted in the last 30 days, the API returns an error. Show: "Expert is in cooldown period. Check the override box to send anyway."

---

### 4.10 Screening

**Purpose:** Send screening questions to experts and record their answers.

#### Dispatch Screening

```
POST /api/v1/screening/dispatch
Body: { "projectId": "...", "expertId": "..." }
```

**UI:** Select project + expert, click "Dispatch Questions". Shows success/failure.

#### Record Response

```
POST /api/v1/screening/response
Body: { "projectId": "...", "expertId": "...", "questionId": "...", "responseText": "..." }
```

**UI pattern:** A form showing each screening question for the project, with a text area for the response. Submit button per question or "Submit All".

---

### 4.11 Job Title Discovery

**Purpose:** Trigger async job title discovery for a project.

```
POST /api/v1/job-title-discovery/trigger
Body: {
  "projectId": "...",
  "companies": [{ "companyName": "Stripe" }],
  "geographyIsoCodes": ["US", "GB"]
}
```

**Form fields:**

| Field              | Input type          | Notes                      |
|--------------------|---------------------|----------------------------|
| Project            | Dropdown            | Select from known projects |
| Companies          | Repeating text rows | Company name (+ optional ID)|
| Geography ISO Codes| Multi-select/tags   | 2-char ISO codes           |

**On success (202):** Show: "Job title discovery queued. Results will appear once the worker processes the job."

This is a fire-and-forget action. There's no polling endpoint for status — results will appear as `JobTitle` records in the project.

---

### 4.12 Documentation Generator

**Purpose:** Trigger generation of architecture docs.

```
POST /api/v1/documentation/generate
```

**UI:** A single "Generate Documentation" button. On success, display: "Documentation generation queued (Job ID: ...)". Output files are written to `docs/generated/` on the server.

---

## 5. Error Handling Patterns

### Error Response Shape

Every API error returns:

```json
{
  "error": {
    "code": "invalid_payload",
    "message": "Human-readable description",
    "details": { }
  }
}
```

### Frontend Error Handler

```typescript
async function apiRequest<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      'x-correlation-id': crypto.randomUUID(),
      ...options.headers
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      redirectToLogin();
      throw new Error('Session expired');
    }

    if (response.status === 429) {
      showToast('Too many requests. Please wait a moment.', 'warning');
      throw new Error('Rate limited');
    }

    const body = await response.json();
    throw new ApiError(response.status, body.error);
  }

  return response.json();
}
```

### Error Display Mapping

| Status | `error.code`         | User-facing message                        | UI treatment    |
|--------|----------------------|--------------------------------------------|-----------------|
| 400    | `invalid_payload`    | Show field-level errors from `details`     | Inline errors   |
| 401    | `unauthorized`       | "Session expired. Please log in again."    | Redirect        |
| 403    | `forbidden`          | "You don't have permission for this action."| Toast/alert    |
| 404    | `not_found`          | "The requested item was not found."        | Empty state     |
| 409    | `invalid_transition` | "This action can't be performed in the current state." | Toast  |
| 429    | —                    | "Too many requests. Please wait."          | Toast + backoff |
| 500    | `internal_error`     | "Something went wrong. Please try again."  | Toast           |

### Validation Error Display

For 400 errors, `details` contains Zod's flattened output:

```json
{
  "error": {
    "code": "invalid_payload",
    "message": "Invalid payload",
    "details": {
      "fieldErrors": {
        "name": ["Required"],
        "targetThreshold": ["Expected number, received string"]
      },
      "formErrors": []
    }
  }
}
```

Map these to inline field errors:

```typescript
function mapFieldErrors(details: any): Record<string, string> {
  const errors: Record<string, string> = {};
  if (details?.fieldErrors) {
    for (const [field, messages] of Object.entries(details.fieldErrors)) {
      errors[field] = (messages as string[]).join('. ');
    }
  }
  return errors;
}
```

---

## 6. Polling & Real-Time Data

The platform has no WebSocket or Server-Sent Events support. Use polling where real-time data matters.

### Recommended Polling Intervals

| Screen                    | Endpoint                            | Interval   | When           |
|---------------------------|-------------------------------------|------------|----------------|
| System health (dashboard) | `GET /system/health`                | 30s        | Dashboard open |
| Caller performance        | `GET /callers/:id/performance/latest`| 30s       | Detail open    |
| Caller current task       | `GET /call-tasks/current`           | 10s        | No task assigned|
| Operator task list        | `GET /call-tasks/operator/tasks`    | 15s        | List open      |

### Polling Pattern

```typescript
function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const result = await fetcher();
        if (active) setData(result);
      } catch { /* handle error */ }
    }

    void poll();
    const id = setInterval(poll, intervalMs);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [fetcher, intervalMs]);

  return data;
}
```

**Stop polling** when the user navigates away from the screen (cleanup in `useEffect`).

---

## 7. State Machine UI Patterns

Several entities follow strict state machines. The frontend should enforce these visually.

### Lead Status Pipeline

Render as a horizontal stepper or pipeline:

```
[NEW] → [ENRICHING] → [ENRICHED] → [OUTREACH_PENDING] → [CONTACTED] → [REPLIED] → [CONVERTED]
                                           ↓
                                     [DISQUALIFIED]
```

- Completed steps: filled/green.
- Current step: highlighted/blue.
- `DISQUALIFIED`: red, breaks out of the pipeline.

### Project Status

Show as a badge with allowed actions:

| Current status | Badge color | Available actions        |
|----------------|-------------|--------------------------|
| `ACTIVE`       | Green       | Pause, Archive, Complete |
| `PAUSED`       | Yellow      | Resume, Archive          |
| `COMPLETED`    | Blue        | —                        |
| `ARCHIVED`     | Gray        | —                        |

### Call Task Status

| Status       | Icon suggestion         | Actionable?          |
|-------------|-------------------------|----------------------|
| `PENDING`   | Clock / queue icon      | Assign (auto)        |
| `ASSIGNED`  | User icon               | Requeue (operator)   |
| `DIALING`   | Phone ringing icon      | Requeue (operator)   |
| `COMPLETED` | Check icon              | View outcome         |
| `EXPIRED`   | Timer expired icon      | —                    |
| `CANCELLED` | X icon                  | —                    |
| `RESTRICTED`| Shield/lock icon        | —                    |

### Caller Allocation Status

Use a traffic-light style indicator on the caller list and detail:

```
🟢 ACTIVE              — Operating normally
🔵 WARMUP_GRACE        — Just started, 5-minute grace period
🟡 AT_RISK             — Performance dropping, 5-min warning
🟠 PAUSED_LOW_DIAL_RATE — Paused for low activity
⚪ IDLE_NO_AVAILABLE_TASKS — Waiting for tasks
🔴 RESTRICTED_FRAUD    — Fraud detected, review needed
🔴 SUSPENDED           — Permanently suspended
```

---

## 8. CORS & Security

### CORS

The backend has CORS enabled (`cors()` middleware). During development, requests from `localhost:3001` (or any origin) are accepted.

For production, the backend should be configured with specific allowed origins.

### Security Headers

The backend uses `helmet()` which sets strict security headers. Your frontend should:

- **Never** store tokens in URLs or query parameters.
- **Never** log tokens to the console in production.
- Sanitize any user-generated content before rendering (XSS prevention).

### Content Security Policy

If deploying the frontend separately, ensure your CSP allows connections to the API origin.

---

## 9. Suggested Tech Stack

| Layer            | Recommendation                         | Why                                   |
|------------------|----------------------------------------|---------------------------------------|
| Framework        | Next.js (App Router) or Vite + React   | SSR optional, great DX                |
| Language         | TypeScript                             | Matches backend, type safety          |
| Styling          | Tailwind CSS + shadcn/ui               | Rapid UI, accessible components       |
| State management | Zustand or TanStack Query              | Lightweight, good for server state    |
| Data fetching    | TanStack Query (React Query)           | Caching, polling, retry built-in      |
| Forms            | React Hook Form + Zod                  | Matches backend validation schemas    |
| Tables           | TanStack Table                         | Sorting, filtering, pagination        |
| Routing          | Next.js App Router or React Router     | Role-based guards                     |
| Toasts           | Sonner or react-hot-toast              | Non-intrusive notifications           |
| Date/time        | date-fns                               | Lightweight, tree-shakeable           |

### TanStack Query Example

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => apiRequest(`/api/v1/projects/${projectId}`, { method: 'GET' })
  });
}

function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProjectInput) =>
      apiRequest('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  });
}
```

---

## 10. API Quick Reference

### Public Endpoints (no auth)

| Method | Path                      | Purpose                |
|--------|---------------------------|------------------------|
| GET    | `/api/v1/system/health`   | Process alive check    |
| GET    | `/api/v1/system/ready`    | Postgres + Redis check |
| POST   | `/api/v1/auth/token`      | Create JWT token       |
| GET    | `/api/v1/openapi.json`    | OpenAPI 3.1.0 spec     |

### Auth: Any Role

| Method | Path                | Purpose            |
|--------|---------------------|--------------------|
| GET    | `/api/v1/auth/me`   | Current identity   |

### Auth: Admin Only

| Method | Path                  | Purpose            |
|--------|-----------------------|--------------------|
| GET    | `/api/v1/admin/ping`  | Admin access check |

### Auth: Admin or Ops

| Method | Path                                                      | Purpose                     |
|--------|-----------------------------------------------------------|-----------------------------|
| POST   | `/api/v1/projects`                                        | Create project              |
| GET    | `/api/v1/projects/:projectId`                             | Get project                 |
| PATCH  | `/api/v1/projects/:projectId`                             | Update project              |
| POST   | `/api/v1/projects/:projectId/companies`                   | Attach companies            |
| POST   | `/api/v1/projects/:projectId/sales-nav-searches`          | Add Sales Nav searches      |
| GET    | `/api/v1/projects/:projectId/screening-questions`         | List screening questions    |
| POST   | `/api/v1/projects/:projectId/screening-questions`         | Create screening question   |
| PATCH  | `/api/v1/projects/:projectId/screening-questions/:qId`    | Update screening question   |
| POST   | `/api/v1/callers`                                         | Register caller             |
| GET    | `/api/v1/callers/:callerId`                               | Get caller                  |
| PATCH  | `/api/v1/callers/:callerId`                               | Update caller               |
| GET    | `/api/v1/callers/:callerId/performance/latest`            | Latest performance metrics  |
| GET    | `/api/v1/call-tasks/operator/tasks`                       | List tasks (filterable)     |
| POST   | `/api/v1/call-tasks/operator/tasks/:taskId/requeue`       | Requeue a task              |
| POST   | `/api/v1/job-title-discovery/trigger`                     | Trigger title discovery     |
| POST   | `/api/v1/outreach/send`                                   | Send outreach message       |
| POST   | `/api/v1/screening/dispatch`                              | Dispatch screening          |
| POST   | `/api/v1/screening/response`                              | Record screening response   |
| POST   | `/api/v1/documentation/generate`                          | Generate docs               |

### Auth: Caller Only

| Method | Path                                   | Purpose               |
|--------|----------------------------------------|------------------------|
| GET    | `/api/v1/call-tasks/current`           | Get/assign current task|
| POST   | `/api/v1/call-tasks/:taskId/outcome`   | Submit call outcome    |

### Webhooks (external, no JWT)

| Method | Path                  | Auth mechanism              |
|--------|-----------------------|-----------------------------|
| POST   | `/webhooks/yay`       | HMAC signature headers      |
| POST   | `/webhooks/sales-nav` | `x-sales-nav-secret` header |
