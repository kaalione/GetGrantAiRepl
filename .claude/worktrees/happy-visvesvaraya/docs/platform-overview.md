# GetGrant.ai — Platform Overview

**Version:** 1.0 (Beta)
**Last Updated:** March 2026
**Purpose:** This document provides a comprehensive overview of the GetGrant.ai platform for review by senior developers and designers. It covers every page, feature, technical specification, UI/UX pattern, and user journey.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Technology Stack](#2-technology-stack)
3. [All Pages — Detailed Descriptions](#3-all-pages--detailed-descriptions)
4. [Technical Specifications](#4-technical-specifications)
5. [UI/UX Design System](#5-uiux-design-system)
6. [User Journeys](#6-user-journeys)
7. [Monetization Model](#7-monetization-model)
8. [Areas for Review](#8-areas-for-review)

---

## 1. Platform Overview

### Purpose
GetGrant.ai is an AI-powered platform that helps Nordic businesses (Sweden, Norway, Finland) discover, evaluate, and apply for grants and funding opportunities. It aggregates grant data from 49 scraper modules covering government agencies, EU programs, and foundations. AI matches companies with relevant grants and generates full application drafts.

### Target Markets
- **Sweden** (primary) — Swedish-language interface, SEK currency
- **Norway** — Norwegian Bokmål interface, NOK currency
- **Finland** — Finnish interface, EUR currency

### Core Value Proposition
1. **Discovery:** Aggregates grants from government agencies, EU programs, and foundations (currently ~2,000+ open grants from 49 scraper modules)
2. **Matching:** AI analyzes company profiles against grant eligibility criteria
3. **Application Writing:** AI generates complete, funder-specific application drafts
4. **Post-Award Management:** Tracks milestones, budget, and reporting after winning grants

### User Roles
| Role | Description |
|:---|:---|
| **Regular User** | Business owner/employee finding and applying for grants |
| **Admin** | Platform operator managing scrapers, users, and fees |
| **Partner** | Grant consultant running a white-label version of the platform for their clients |
| **Partner Client** | End user accessing the platform through a partner's branded portal |

---

## 2. Technology Stack

### Frontend
| Technology | Purpose |
|:---|:---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool and dev server |
| Wouter | Client-side routing |
| TanStack React Query v5 | Server state management, caching |
| Tailwind CSS | Utility-first styling |
| shadcn/ui (New York style) | Component library (built on Radix UI) |
| react-i18next | Internationalization (4 languages) |
| React Hook Form + Zod | Form handling and validation |
| date-fns | Date formatting |
| Lucide React | Icon library |
| react-helmet-async | SEO meta tags |

### Backend
| Technology | Purpose |
|:---|:---|
| Express.js 5 + TypeScript | HTTP server and API |
| PostgreSQL | Primary database |
| Drizzle ORM + Drizzle Kit | Database queries and schema management |
| connect-pg-simple | Session storage |
| Zod | Request validation |

### External Services
| Service | Purpose |
|:---|:---|
| Anthropic Claude (Claude 3.5 Sonnet) | AI: matching, eligibility extraction, application writing, compliance checking |
| Stripe | Subscription billing, success fee invoicing |
| Resend | Transactional email (notifications, digests, invites) |
| Replit Auth (OpenID Connect) | User authentication |

### Tooling
| Tool | Purpose |
|:---|:---|
| esbuild | Server-side TypeScript bundling |
| tsx | TypeScript execution for development |
| Drizzle Kit | Database schema migrations |

---

## 3. All Pages — Detailed Descriptions

### 3.1 Landing Page (shown at `/` for unauthenticated visitors)
**Purpose:** Marketing page displayed when users are not logged in. The `/` route maps to Dashboard for authenticated users; the Landing page is conditionally rendered by `AppContent` when no session exists.

**Sections:**
1. **Fixed Header** — Logo ("getgrant.ai" + Sparkles icon), Language Switcher, Theme Toggle, "Log in" button
2. **Hero** — Badge ("AI-powered grant platform"), headline ("Find and apply for grants in 5 minutes"), four proof points (1,700+ grants, 39+ sources, auto-updated daily, fully in Swedish)
3. **Product Preview** — Mock browser window showing the platform dashboard UI with stats
4. **Statistics Bar** — Blue strip: 1,700+ active grants, 39+ sources, 5 min average time, 100% free to try
5. **How It Works** — Three-step guide: Create profile (2 min) → AI finds matches → Generate application
6. **Comparison** — Side-by-side: Traditional approach (2-3 weeks, manual) vs. GetGrant.ai (5 minutes, AI-powered)
7. **Feature Grid** — Six cards: Grant Sources, AI Matching, Automatic Applications, Email Notifications, Save Applications, Export to Word/PDF
8. **Social Proof** — "Coming Soon" testimonials section (beta phase)
9. **Pricing Section** — Three tiers: Free (0 kr), Pro (795 kr/mo), Enterprise (3,995 kr/mo)
10. **Final CTA** — Gradient banner: "Ready to find your next grant?" with "Get started free today" button
11. **Footer** — Logo, links to Product, Company, Legal sections

**CTAs:** All "Get started" / "Log in" buttons redirect to `/api/login` (Replit Auth flow)

---

### 3.2 Onboarding Wizard (Modal overlay)
**Purpose:** Guides new users through company profile setup using AI-powered website extraction. Appears as a full-screen overlay after first login.

**Steps (7 total):**

| Step | Name | What Happens |
|:---|:---|:---|
| 1 | **Welcome** | Introduction to the platform; explains AI-powered grant matching |
| 2 | **Market Selection** | User picks primary market: Sweden, Norway, or Finland. Sets language, currency, and grant sources |
| 3 | **Website URL** | User enters company URL. System scrapes multiple subpages (/about, /om-oss, /team, etc.) and sends content to Claude AI for extraction. Option to skip and enter manually |
| 4 | **Review Profile** | Displays AI-extracted data with confidence scores. User reviews, edits, and confirms: Company Name, Org Number, Industry, Employees, Revenue, Founded Year, Description, Location, Focus Areas |
| 5 | **Goals** | Collects funding goals, target amount ranges, and urgency level |
| 6 | **Notifications** | Sets preferences for weekly digests, instant match alerts, deadline reminders |
| 7 | **Completion** | Confirms setup, optional feedback on extraction quality, redirects to personalized grant matches |

**AI Extraction Pipeline:**
1. Normalize URL and generate list of high-value subpages to crawl
2. Fetch HTML with specific User-Agent, use `cheerio` to strip non-textual elements
3. Send cleaned text (up to 30,000 chars) to Claude with structured extraction prompt
4. Map AI output to company schema with confidence scores per field
5. Cache scraped pages in `website_scrape_cache` table (7-day TTL, skip entries < 50 bytes)

**Onboarding Resume Logic:** If a returning user has a company profile with < 40% completion and an active onboarding session, the wizard is shown again to encourage profile completion.

**Rate Limits:** 10 extractions per session/day

---

### 3.3 Dashboard (`/`)
**Purpose:** Main landing page after login. Provides an overview of grants, progress, and activity.

**Sections:**

1. **Hero Section** — Blue-to-cyan gradient welcome banner with "Explore Grants" and "My Applications" quick action buttons

2. **Stats Cards Row** (5 cards):
   - Available Grants (open count / total)
   - New This Week (grants added in last 7 days)
   - Ongoing Drafts (in-progress applications)
   - Expiring Soon (deadlines within 30 days)
   - Sent Notifications (email alert count)

3. **Progress Tracker** — Visual onboarding progress: "Create Profile" → "Browse Grants" → "Bookmark Grant" → "Start Application" → "Submit Application". Shows percentage complete and next recommended step

4. **Profile Completion Banner** — Appears if profile is incomplete. Lists missing fields with an "AI-powered completion" button. The 8 tracked fields are: companyName, orgNumber, industry, employees, revenue, foundedYear, description, location

5. **Upgrade Prompt Banner** — Contextual suggestion to switch from success-fee to subscription if it would save money

6. **Deadline Alerts**:
   - Red alert card for grants closing within 7 days
   - Urgent grants card for grants closing within 14 days

7. **Top Matches** — Grid of top 3 grants with highest AI match scores (requires company profile)

8. **Eligibility Dashboard** — Categorizes grants into: Ready to Apply, Almost There, Needs Changes

9. **Active Projects** — Shows post-award projects with health status (On Track, At Risk, Delayed), approved amounts, and completion progress bars

10. **Active Agreements** — Success Fee agreement indicators with shortcut to report outcomes

---

### 3.4 Grants Listing (`/bidrag`)
**Purpose:** Searchable, filterable catalog of all available grants.

**Layout:** Two-column on desktop (sidebar filters + card grid). Single column on mobile with collapsible filters.

**Filter Sidebar:**
- Text search (title + description)
- Status pills: Open + Upcoming (default), Open, Upcoming, Closed, All
- Source dropdown (all scraped sources)
- Deadline timeframe: 7/30/60/90 days
- Amount range slider (0 – 50M SEK)
- Active filters summary with clear-all button

**Grant Cards (2-column grid on desktop, 1-column on mobile):**
Each card shows:
- Title (linked to detail page, 2-line clamp)
- Source/funder name
- Status badge (Open/green, Closing Soon/amber or red, Closed/gray, Upcoming/blue)
- AI Match Score indicator (when company profile exists)
- Expandable match explanation (AI-generated reasoning for why the grant matches)
- Description (2-line clamp)
- Eligibility badge (Eligible/green, Almost/amber, Not Eligible/red)
- Application status badge (if user has started an application)
- Source type badge (EU, Myndighet, Stiftelse)
- Target group badges (startup, SME, etc.)
- Funding amount and deadline
- "Visa detaljer" (View Details) primary button
- Bookmark star icon
- External link button (to original source)

**Tabs:** All Grants | Bookmarked (starred grants)

**Toggle:** "Show matching" / "Show all" — filters to only grants matching the company profile

**Empty States:**
- When "Show matching" is active and no matches found: shows "No matching grants" with a button to switch to "Show all"
- When filters are active and no results: shows "No matching grants" with "Clear filters" button
- When no grants exist at all: shows "No grants yet" generic empty state

---

### 3.5 Grant Detail (`/bidrag/:id`)
**Purpose:** Full information about a specific grant, including AI-powered eligibility and match analysis.

**Sections:**
1. **Header** — Title, source name, status badge with deadline countdown
2. **Description** — Full grant description text
3. **Eligibility Criteria (Structured):**
   - Organization types
   - Company size requirements (employees)
   - Revenue requirements
   - Geographic restrictions
   - Industry sectors
   - Collaboration requirements
   - Funding details (amounts, co-financing percentage)
   - Who cannot apply (exclusions)
4. **Application Requirements** — List of needed documents/information
5. **Rule-Based Match Analysis** — Score calculated locally from company profile vs. grant criteria fields
6. **AI Match Analysis** (Claude-powered):
   - Percentage match score
   - Detailed reasoning
   - Strengths (why the company fits)
   - Concerns (potential hurdles)
7. **AI Eligibility Check** — Deep analysis of each eligibility criterion with pass/fail/uncertain verdicts
8. **User Actions:**
   - Bookmark/Save grant
   - "Ansök nu" (Apply Now) — primary CTA to start application

---

### 3.6 Grant Application Wizard (`/bidrag/:id/apply`)
**Purpose:** Multi-step wizard for generating a full AI-powered grant application.

**Steps:**

| Step | Name | Description |
|:---|:---|:---|
| 1 | **Grant Review** | Confirms grant details, shows eligibility badge |
| 2 | **Company Profile** | Shows current company profile used for generation, with edit option |
| 3 | **Project Information** | Form: Project description (min 50 chars), goals, expected results, total budget, requested funding amount, previous experience (optional) |
| 4 | **Application Result** | AI generates structured application; user edits, regenerates sections, runs compliance check, and exports |

**AI Application Generation Pipeline:**
1. System identifies the funder (e.g., Vinnova, Tillväxtverket, Business Finland)
2. If known funder → uses funder-specific section templates. If unknown → generic template
3. Searches user's Content Library for relevant reusable snippets
4. Sends comprehensive prompt to Claude (grant details + company profile + project data + library blocks) per section
5. Returns structured application split into sections

**Step 4 Features:**
- **Section Editor** — Rich text editing per section
- **AI Regeneration** — Rewrite a specific section with custom instructions (e.g., "Make it more technical")
- **Compliance Check** — AI reviews draft against funder-specific rules, flags risks and scores compliance
- **Version History** — Track changes per section with restore capability
- **Collaboration** — Real-time presence indicators, invite collaborators, comment threads
- **Export** — Download as Word (.docx) or PDF

---

### 3.7 Company Profile (`/company`)
**Purpose:** Manage the company information used for AI matching and application generation.

**Sections:**

1. **Smart Onboarding Card** — Gradient card at top inviting users to enter a website URL for AI extraction
2. **AI Diff Panel** — After extraction, shows "Current" vs "AI-suggested" values side-by-side with confidence scores (green/amber badges). Options: "Apply All" or "Apply Selected"
3. **Profile Form** — Fields:
   - Company Name (required)
   - Organization Number (XXXXXX-XXXX format)
   - Organization Type (AB, Enskild firma, HB, KB, etc.)
   - Founded Year
   - Website URL
   - Industry (dropdown: Tech/IT, Health, Energy, Manufacturing, etc.)
   - Number of Employees
   - Annual Revenue (SEK)
   - Location (City)
   - Description (textarea)
   - Focus Areas (tag-based input: AI, Sustainability, Digitalization, etc.)
4. **Market Settings** — Selector for primary market (Sweden, Norway, Finland)
5. **Notification Preferences** — Email address for alerts, enable/disable toggle

**Profile Completion:** 8 fields tracked (companyName, orgNumber, industry, employees, revenue, foundedYear, description, location). 90% threshold = "profileCompleted" milestone.

---

### 3.8 Applications List (`/ansokan`)
**Purpose:** Overview of all grant applications the user has created.

**Features:**
- **Status Tabs:** All, Drafts, Submitted
- **Application Cards:** Shows grant title, company name, match score, compliance score badge (if checked)
- **Quick Actions:** Open application, delete draft

---

### 3.9 Calendar (`/kalender`)
**Purpose:** Visual timeline of upcoming deadlines and project milestones.

**Features:**
- **Views:** Calendar grid view and List view
- **Event Types:** Grant deadlines (from bookmarks/applications) and project milestones
- **Urgency Coding:** Red (urgent), Primary color (medium), Default (upcoming)
- **Integrations:** Add to Google Calendar, download .ics file

---

### 3.10 Alerts (`/alerts`)
**Purpose:** Automated grant monitoring. Users define search criteria and get notified when matching grants appear.

**Features:**
- **Alert List:** Shows active/inactive alerts with match counts
- **Create/Edit Alert:** Set keywords, sources, amount ranges (min/max), minimum match score
- **Match Viewer:** View all grants currently matching a specific alert
- **Toggle:** Enable/disable individual alerts

---

### 3.11 Content Library (`/bibliotek`)
**Purpose:** Repository of reusable text blocks extracted from previous applications, for use in new AI-generated content.

**Features:**
- **Categorized Blocks:** Grouped by type (Company Description, Team Overview, Market Analysis, etc.)
- **AI Extraction:** Tool to auto-extract reusable sections from completed application drafts
- **Management:** Add, edit, approve, copy blocks to clipboard
- **AI Suggestions:** When writing a new application, the system suggests relevant blocks from the library

---

### 3.12 Settings (`/settings`)
**Purpose:** User-level configuration.

**Features:**
- Notification preferences (email digest frequency, alert types)

---

### 3.13 Success Dashboard (`/success`)
**Purpose:** Gamification and milestone tracking.

**Features:**
- **Milestones:** Progress tracker: Profile Created → First Bookmark → First Application → First Submission
- **Activity Stats:** Total applications, submitted apps, approved grants, saved bookmarks
- **Recent Activity:** Lists latest submissions and drafts

---

### 3.14 Projects — Post-Award Management (`/projekt`)
**Purpose:** Track and manage grants after winning them.

**Projects List:**
- Project cards showing funder, status (Active, On Hold, Completed), health badge (On Track, At Risk, Delayed, Blocked)
- Two progress bars: Milestones (% complete) and Budget (% spent, red if over)
- Next Milestone and Next Report due dates with urgency indicators
- **Create Wizard:** Enter approved amount, start/end dates, funder portal URL, co-funding. "Quick Setup" auto-generates standard milestones and budget categories

---

### 3.15 Project Detail (`/projekt/:id`)
**Purpose:** Comprehensive management hub for a single post-award project.

**Tabs:**

| Tab | Features |
|:---|:---|
| **Overview** | KPI cards (approved amount, time remaining, milestone completion, budget usage). Visual timeline with progress bar. Contact info (reporting contact, funder portal URL, agreement reference). Project notes |
| **Milestones** | Add/edit/reorder milestones (drag-and-drop via @dnd-kit). Deliverable types (Technical Report, Software, Prototype). Status workflow: Pending → In Progress → Completed. Due date tracking with days remaining/overdue |
| **Reports** | Schedule: progress, financial, and final reports. AI draft generation from project data. Submission tracking with funder deadlines and confirmation references |
| **Budget** | Categories: Personnel, Travel, Equipment, Indirect Costs. Metrics: spent vs. budgeted, remaining balance, monthly burn rate. Expense logging with descriptions, amounts, dates, suppliers. Co-funding tracking. Funder-specific budget initialization (e.g., Vinnova) |
| **Team** | Member allocation (internal/external), roles, % allocation. Cost projection based on salaries vs. budget. Variance analysis against budgeted personnel costs |
| **Risks** | Risk registry with Probability and Impact (Low/Medium/High). Auto-calculated risk score with color-coded badges. Mitigation plans. Mark risks as mitigated/closed |
| **Documents** | Central repository: Grant Agreements, Financial Reports, Invoices, Proof of Approval. File tracking with URLs and metadata |
| **Activity** | Audit trail of all project actions. Filterable by type (milestone, report, budget, etc.) |

---

### 3.16 Pricing (`/priser`)
**Purpose:** Subscription plan comparison and payment.

**Plans:**

| Plan | Price | Key Features |
|:---|:---|:---|
| **Free** | 0 kr/mo | Search, filter, track grants. Subject to 3% success fee on wins |
| **Pro** | 795 kr/mo | AI matching, AI application writing, email notifications, DOCX/PDF export. No success fee |
| **Enterprise** | 3,995 kr/mo | Unlimited AI, team collaboration (5 users), API access, priority support |

**Additional Features:**
- Fee Calculator tool to estimate success fee costs
- Partner plans section for grant consultants
- Stripe-powered checkout

---

### 3.17 Success Fee Terms (`/terms/success-fee`)
**Purpose:** Legal and operational explanation of the pay-per-win model.

**Content:**
- Step-by-step process: Apply for free → Report outcome → Pay 3% on win only
- Fee details: 3% rate, 25,000 SEK maximum cap, 500 SEK minimum
- FAQ: What happens on rejection, cancellation, and how Stripe invoicing works

---

### 3.18 Admin Pages

#### 3.18.1 Admin Users (`/admin/users`)
- **Stats:** Total users, active (7d/30d), never logged in, plan distribution
- **User Table:** Name, email, plan badge, last login, registration date

#### 3.18.2 Admin Sources (`/admin/sources`)
- **Source List:** All configured scrapers with type (API/Scraper), frequency (Daily/Weekly), status (Active/Inactive toggle)
- **Actions:** Manually trigger scraper, edit config, delete source
- **Execution Status:** Latest run result (Success/Failure), grant count found
- **Source Editor** (`/admin/sources/new` and `/admin/sources/:id/edit`): Form with JSON config editor

#### 3.18.3 Admin Logs (`/admin/logs`)
- **Log Table:** Timestamp, source name, status (Success/Error/Running), grants found, error messages
- **Filters:** By status and source
- **Refresh:** Manual refresh button

#### 3.18.4 Admin Settings (`/admin/settings`)
- **Database:** Auto-cleanup of expired grants, daily backups, data export
- **Notifications:** Global email toggle, deadline reminders (7 days), weekly scraping reports
- **Appearance:** Compact view, animations toggle
- **Security:** 2FA toggle, session logging, password change
- **Platform Info:** Version 1.0.0, license, last update

#### 3.18.5 Admin Success Fee (`/admin/success-fee`)
- **Overview Tab:** Total agreements, status distribution, collected revenue, outstanding/overdue amounts, flagged agreements
- **Agreements Tab:** Searchable list with grant titles, funders, fees, user IDs. Actions: send reminders, flag for review, mark reviewed
- **Settings Tab:** Enable/disable feature, fee percentage, max cap (SEK), minimum fee, payment terms (days), auto-expiration, terms version

---

### 3.19 Partner Pages (White-Label Platform)

#### 3.19.1 Partner Dashboard (`/partner`)
- **Stats:** Total clients, active clients, pending invitations, current plan
- **Plan Usage:** Progress bar (clients used vs. plan limit)
- **Recent Activity:** Chronological event feed (sign-ups, applications submitted)
- **Recent Clients:** Quick-view list with status (Active, Invited, Blocked)
- **Quick Actions:** Invite Client, Manage Branding buttons

#### 3.19.2 Partner Clients (`/partner/clients`)
- **Client Table:** Names, emails, companies, status, registration dates
- **Invite:** Send email invitations with optional name and company fields
- **Actions:** Resend invitation, block user, remove client
- **Filtering:** Search bar + status filters (Active, Invited, Blocked, Inactive)

#### 3.19.3 Partner Branding (`/partner/branding`)
- **Visual Identity:** Upload logo and favicon, set platform name and tagline
- **Theming:** Color pickers for primary, accent, and text colors. Font family selector (Inter, Roboto, Open Sans, etc.)
- **Support & Footer:** Custom support email, URL, and footer text
- **Live Preview:** Real-time branded preview card

#### 3.19.4 Partner Domain (`/partner/domain`)
- **Subdomain:** Default `[subdomain].getgrant.ai`
- **Custom Domain:** Available on Professional/Enterprise plans
- **DNS Management:** CNAME and TXT records for verification
- **Verification Status:** Pending/Verified indicator

#### 3.19.5 Partner Analytics (`/partner/analytics`)
- **Time Filters:** 7 days, 30 days, 90 days, 12 months
- **Growth Charts:** Bar chart of client acquisition over time
- **Top Clients:** Leaderboard by application submissions
- **Export:** CSV download

#### 3.19.6 Partner Settings (`/partner/settings`)
- **Company Profile:** Legal name, org number, contact details
- **Billing:** Stripe integration for subscription management
- **API Keys:** Generate/manage keys with scopes (read_clients, manage_clients, read_analytics)
- **Client Self-Signup:** Toggle to allow/disallow self-registration

#### 3.19.7 Partner Join (`/join/:token`)
- Token-verified onboarding page for invited clients
- Branded experience (partner's logo, colors)
- Registration form for name and company details

#### 3.19.8 Branded Login (`/partner/branded-login`)
- White-labeled login portal with partner branding
- Login and Create Account buttons (if self-signup enabled)
- Partner support email link

---

## 4. Technical Specifications

### 4.1 Database Schema

The platform uses 30+ PostgreSQL tables managed via Drizzle ORM.

#### Core Tables

| Table | Purpose | Key Fields |
|:---|:---|:---|
| `grants` | All grant/funding opportunities | id (UUID), title, description, sourceName, sourceType, url, deadline, amountMin, amountMax, eligibilityCriteria (JSON), structuredEligibility (JSON), targetGroup (text[]), keywords (text[]), status, market, language, rawData (JSON) |
| `companies` | User company profiles | id (UUID), userId, companyName, orgNumber, industry, employees, revenue, foundedYear, description, location, websiteUrl, focusAreas (text[]), market, notificationEmail |
| `applications` | Grant applications | id (UUID), userId, grantId, companyId, status, sections (JSON), projectDescription, projectGoals, budget, requestedAmount, previousExperience, complianceScore, submittedAt |
| `scraper_sources` | Configured scraper sources | id (UUID), name, type, url, frequency, config (JSON), isActive, lastRunAt, lastRunStatus |
| `scraper_logs` | Scraper execution history | id (UUID), sourceId, status, grantsFound, errorMessage, startedAt, completedAt |
| `notifications` | Sent notification records | id (UUID), companyId, grantId, type, sentAt |

#### User & Preferences Tables

| Table | Purpose |
|:---|:---|
| `user_progress` | Onboarding milestone tracking (profileCompleted, firstBookmark, firstApplication, firstSubmission) |
| `notification_preferences` | Email frequency, alert type toggles per user |
| `grant_alerts` | Saved search criteria for automated monitoring |
| `alert_matches` | Grants matching specific alerts |
| `grant_bookmarks` | Saved/starred grants per user |
| `onboarding_sessions` | Tracks wizard progress, extracted data, current step |
| `website_scrape_cache` | Cached website scrape results (7-day TTL) |

#### AI & Analysis Tables

| Table | Purpose |
|:---|:---|
| `eligibility_checks` | AI eligibility analysis results per grant+company pair |
| `match_explanations` | AI-generated match reasoning per grant+company pair |

#### Collaboration Tables

| Table | Purpose |
|:---|:---|
| `application_collaborators` | Invited team members on applications (role: viewer/editor/admin) |
| `application_comments` | Comment threads on application sections |
| `application_section_history` | Version history for each application section |
| `application_presence` | Real-time presence tracking (who is editing what section) |

#### Content Library Tables

| Table | Purpose |
|:---|:---|
| `content_library` | Reusable text blocks with categories, tags, and source tracking |
| `content_library_usage` | Records when/where blocks are used in applications |

#### Post-Award Project Tables

| Table | Purpose |
|:---|:---|
| `grant_projects` | Top-level project records (status, health, dates, co-funding) |
| `project_milestones` | Milestone tracking with deliverable types |
| `project_reports` | Periodic reports (progress, financial, final) |
| `project_budget_categories` | Budget allocation per category |
| `project_expenses` | Individual expense entries |
| `project_team_members` | Team allocation and roles |
| `project_activity_log` | Audit trail of all project changes |
| `project_documents` | Document repository (agreements, invoices) |
| `project_risks` | Risk registry with probability/impact scoring |

#### Success Fee Tables

| Table | Purpose |
|:---|:---|
| `success_fee_agreements` | Fee agreements tied to applications (status, calculated fee, Stripe invoice) |
| `success_fee_settings` | Global fee configuration (percentage, caps, payment terms) |
| `success_fee_events` | Event log for agreement state changes |
| `success_fee_upgrade_prompts` | Tracks when users are shown upgrade suggestions |

#### Partner/White-Label Tables

| Table | Purpose |
|:---|:---|
| `partners` | Partner accounts (plan, subdomain, branding config) |
| `partner_clients` | Client records under each partner |
| `partner_activity_log` | Partner-level audit trail |
| `partner_api_keys` | API keys with scopes for partner integrations |
| `partner_usage_stats` | Cached analytics data per partner |
| `partner_email_settings` | Partner-specific email configuration |

---

### 4.2 API Endpoints

The platform exposes 120+ REST API endpoints across 10 route files (~9,100 lines of route code).

#### Core Routes (`server/routes.ts`)

**Dashboard & User**
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/user/status` | User onboarding/company status |
| GET | `/api/user/profile-completion` | Profile completion percentage + missing fields |
| GET | `/api/user/onboarding-progress` | Persisted onboarding milestones |

**Grants**
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/grants` | List/filter grants (status, source, search, deadline, amount, market) |
| GET | `/api/grants/top-matches` | Top 5 matching grants for user's company |
| GET | `/api/grants/sources` | Unique source names |
| GET | `/api/grants/deadlines/upcoming` | Grants with deadlines in next 14 days |
| GET | `/api/grants/eligibility-overview` | Batch eligibility check across all grants |
| GET | `/api/grants/:id` | Single grant details |
| GET | `/api/grants/:id/eligibility` | Eligibility status for specific grant |
| GET | `/api/grants/:id/explain-match` | Cached AI match explanation |
| POST | `/api/grants/:id/explain-match` | Generate AI match explanation |
| GET | `/api/grants/:id/eligibility-check` | Detailed AI eligibility check results |
| POST | `/api/grants/:id/eligibility-check` | Run AI eligibility check |
| POST | `/api/grants` | Create grant (admin) |
| PATCH | `/api/grants/:id` | Update grant (admin) |
| DELETE | `/api/grants/:id` | Delete grant (admin) |

**Companies**
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/companies` | List user's companies |
| GET | `/api/companies/:id` | Company details |
| POST | `/api/companies` | Create company profile |
| PATCH | `/api/companies/:id` | Update company profile |
| PUT | `/api/companies/market` | Update market preference |
| DELETE | `/api/companies/:id` | Delete company |
| POST | `/api/company/research` | AI company research/enrichment |

**Applications**
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/applications` | List user's applications |
| GET | `/api/applications/:id` | Application details |
| POST | `/api/applications` | Start new application |
| PATCH | `/api/applications/:id` | Update application |
| POST | `/api/applications/generate` | AI-generate full application |
| PUT | `/api/applications/:id/section/:sectionKey` | Update specific section |
| POST | `/api/applications/:id/regenerate-section` | Regenerate section with AI |
| PATCH | `/api/applications/:id/status` | Update application status |
| DELETE | `/api/applications/:id` | Delete application |
| GET | `/api/applications/templates` | List application templates |
| GET | `/api/applications/templates/:grantId` | Template for specific grant |
| POST | `/api/applications/:id/compliance-check` | Run AI compliance check |
| GET | `/api/applications/:id/compliance-check` | Get compliance results |
| GET | `/api/applications/:id/export/docx` | Export to Word |
| GET | `/api/applications/:id/export/pdf` | Export to PDF |

**Notifications & Alerts**
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/notifications/preferences` | Get notification settings |
| PATCH | `/api/notifications/preferences` | Update settings |
| POST | `/api/notifications/push-subscribe` | Register push notifications |
| DELETE | `/api/notifications/push-subscribe` | Unsubscribe from push |
| POST | `/api/notifications/test` | Send test email |
| GET | `/api/alerts` | List grant alerts |
| POST | `/api/alerts` | Create alert |
| PATCH | `/api/alerts/:id` | Update alert |
| DELETE | `/api/alerts/:id` | Delete alert |
| GET | `/api/alerts/:id/matches` | Grants matching alert |

**Bookmarks & Calendar**
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/bookmarks` | List bookmarked grants |
| GET | `/api/bookmarks/check/:grantId` | Check bookmark status |
| POST | `/api/bookmarks` | Add bookmark |
| DELETE | `/api/bookmarks/:grantId` | Remove bookmark |
| GET | `/api/calendar/events` | Deadlines + milestones for calendar |

**Billing**
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/billing/config` | Stripe public key + plans |
| GET | `/api/billing/subscription` | Current subscription |
| POST | `/api/billing/checkout` | Create Stripe checkout session |
| POST | `/api/billing/portal` | Create Stripe portal session |

**Admin**
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/admin/users` | List all platform users |
| GET | `/api/admin/users/stats` | User growth statistics |
| GET | `/api/admin/eligibility/status` | Eligibility extraction job status |
| POST | `/api/admin/eligibility/extract` | Run eligibility extraction on all grants |
| POST | `/api/admin/eligibility/extract/:grantId` | Extract for specific grant |
| POST | `/api/cron/extract-eligibility` | Cron endpoint for extraction |

#### Collaboration Routes (`server/routes/collaboration.ts`)
| Method | Path | Description |
|:---|:---|:---|
| POST | `/api/applications/:id/collaborators/invite` | Invite collaborator |
| GET | `/api/applications/:id/collaborators` | List collaborators |
| PUT | `/api/applications/:id/collaborators/:cId/role` | Change role |
| DELETE | `/api/applications/:id/collaborators/:cId` | Remove collaborator |
| GET | `/api/invites/:token` | Get invitation info |
| GET | `/api/invites/:token/accept` | Accept invitation |
| GET | `/api/applications/:id/comments` | List comments |
| POST | `/api/applications/:id/comments` | Post comment |
| PUT | `/api/applications/:id/comments/:cId/resolve` | Resolve comment |
| DELETE | `/api/applications/:id/comments/:cId` | Delete comment |
| GET | `/api/applications/:id/sections/:key/history` | Section edit history |
| POST | `/api/applications/:id/sections/:key/save` | Save version |
| POST | `/api/applications/:id/sections/:key/restore/:hId` | Restore version |
| POST | `/api/applications/:id/presence` | Update presence |
| GET | `/api/shared-applications` | Shared applications |

#### Onboarding Routes (`server/routes/onboarding.ts`)
| Method | Path | Description |
|:---|:---|:---|
| POST | `/api/onboarding/start` | Initialize session |
| POST | `/api/onboarding/extract` | Extract from website URL |
| GET | `/api/onboarding/session` | Get current state |
| PUT | `/api/onboarding/step` | Update current step |
| POST | `/api/onboarding/save-profile` | Save company profile |
| POST | `/api/onboarding/save-goals` | Save funding goals |
| POST | `/api/onboarding/save-notifications` | Save notification prefs |
| POST | `/api/onboarding/complete` | Finalize onboarding |
| POST | `/api/onboarding/skip` | Skip onboarding |
| POST | `/api/onboarding/retry-extraction` | Retry extraction |

#### Project Routes (`server/routes/projects.ts`)
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/projects/dashboard` | Projects summary |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Project details |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/projects/from-application/:appId` | Convert application to project |
| POST | `/api/projects/:id/milestones` | Add milestone |
| PUT | `/api/projects/:id/milestones/:mId` | Update milestone |
| POST | `/api/projects/:id/milestones/:mId/complete` | Complete milestone |
| DELETE | `/api/projects/:id/milestones/:mId` | Remove milestone |
| POST | `/api/projects/:id/milestones/reorder` | Reorder milestones |

#### Content Library Routes (`server/routes/contentLibrary.ts`)
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/content-library` | Search/list blocks |
| POST | `/api/content-library` | Create block |
| PUT | `/api/content-library/:id` | Update block |
| DELETE | `/api/content-library/:id` | Delete block |
| POST | `/api/content-library/extract/:appId` | Extract from application |
| POST | `/api/content-library/:id/approve` | Approve extracted block |
| GET | `/api/content-library/suggestions/:sectionKey` | AI suggestions |
| POST | `/api/content-library/:id/use` | Record usage |

#### Success Fee Routes (`server/routes/successFee.ts`)
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/success-fee/terms` | Current terms + examples |
| GET | `/api/success-fee/eligibility` | Check plan eligibility |
| POST | `/api/success-fee/agreements` | Create agreement |
| PUT | `/api/success-fee/agreements/:id/agree` | Accept terms |
| POST | `/api/success-fee/agreements/:id/report-outcome` | Report win/rejection |
| GET | `/api/success-fee/agreements` | List agreements |
| GET | `/api/success-fee/agreements/:id` | Agreement details |
| DELETE | `/api/success-fee/agreements/:id` | Cancel agreement |
| GET | `/api/success-fee/calculate` | Preview fee for amount |
| GET | `/api/success-fee/admin/stats` | Admin stats |

#### Partner Routes (`server/routes/partners.ts`, `partnerAdmin.ts`, `partnerDomain.ts`)
| Method | Path | Description |
|:---|:---|:---|
| POST | `/api/partners/register` | Register as partner |
| GET | `/api/partners/subdomain-check/:subdomain` | Check availability |
| GET | `/api/partners/profile` | Partner profile |
| PUT | `/api/partners/profile` | Update profile |
| GET | `/api/partners/branding` | Get branding |
| PUT | `/api/partners/branding` | Update branding |
| GET | `/api/partners/clients` | List clients |
| POST | `/api/partners/clients/invite` | Invite client |
| POST | `/api/partner/domain` | Configure domain |
| POST | `/api/partner/domain/verify` | Verify DNS |
| GET | `/api/partner/api-keys` | List API keys |
| POST | `/api/partner/api-keys` | Generate API key |
| GET | `/api/partner/analytics` | Usage analytics |
| GET | `/api/admin/partners` | List all partners (super admin) |
| POST | `/api/admin/partners/:id/suspend` | Suspend partner |

#### Auth Routes
| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/login` | Replit Auth login |
| GET | `/api/logout` | Clear session |
| GET | `/api/auth/user` | Current user info |
| GET | `/api/whitelabel/config` | Whitelabel branding config |

---

### 4.3 AI Services

The platform uses Anthropic Claude for eight AI services. Primary model: `claude-sonnet-4-5-20250929` (Claude 3.5 Sonnet). Lighter tasks use `claude-haiku-4-5` (Claude 3.5 Haiku).

| Service | File | Model | Purpose |
|:---|:---|:---|:---|
| **Website Extractor** | `server/services/websiteExtractor.ts` | Sonnet | Scrapes company websites and extracts structured profile data (name, industry, employees, focus areas) with confidence scores |
| **Company Research** | `server/services/companyResearch.ts` | Sonnet | Combines website scraping with public records (e.g., allabolag.se) for enriched profiles |
| **Application Writer** | `server/services/applicationWriter.ts` | Sonnet | Generates full grant applications using funder-specific templates (Vinnova, Tillväxtverket, Energimyndigheten, etc.). Integrates Content Library blocks for consistency |
| **Eligibility Checker** | `server/services/aiEligibilityChecker.ts` | Sonnet | Hybrid rule-based + AI analysis of company eligibility. Produces pass/fail verdicts per criterion with 0-100 score |
| **Eligibility Extractor** | `server/services/eligibilityExtractor.ts` | Sonnet | Batch-processes raw grant text to extract structured eligibility criteria (company size, revenue, geography, sectors) |
| **Compliance Checker** | `server/services/complianceChecker.ts` | Sonnet | Reviews draft applications against funder-specific evaluation criteria. Scores compliance, readiness level, and estimated success rate |
| **Match Explainer** | `server/services/matchExplanation.ts` | Haiku | Generates 1-sentence headline + 2-3 bullet points explaining why a grant matches a company |
| **Content Library Extractor** | `server/services/contentLibrary.ts` | Haiku | Extracts reusable "evergreen" content blocks from completed applications |
| **Report Generator** | `server/services/reportGenerator.ts` | Sonnet | Drafts progress and final reports for post-award projects using project data and funder-specific styles |

---

### 4.4 Scraper System

**Python scraper service** (`scrapers/`) collects grant data from 49 source modules across three countries.

**Source Coverage:**
- **Sweden:** Vinnova (API + Web), Tillväxtverket, Almi, Energimyndigheten, Naturvårdsverket, Formas, Jordbruksverket, Regional authorities (Stockholm, Skåne, VGR)
- **Norway:** Innovasjon Norge, Forskningsrådet, Enova, SkatteFUNN, Regionalforvaltning.no
- **Finland:** Business Finland, Ely-keskus, Ruokavirasto, Finnpartnership
- **EU/International:** Horizon Europe, EIT KICs (Health, Digital), Cassini (EUSPA), NATO SPS, Interreg programs (Aurora, Baltic Sea)

**Architecture:**
- `scrapers/main.py` — Entry point/orchestrator
- `scrapers/sources/base_scraper.py` — Base class with shared utilities (Nordic date parsing, currency extraction, status determination)
- `scrapers/sources/*.py` — 49 source-specific scraper modules
- `scrapers/utils/db.py` — Direct PostgreSQL connection (psycopg2) for upserts
- `scrapers/utils/dedup.py` — URL/title deduplication logic
- `scrapers/scheduler.py` — Background daemon using `schedule` library

**Scraping Methods:**
- HTML scraping with Playwright (JS-heavy sites) or requests + BeautifulSoup
- API integrations (EU Funding & Tenders portal, Vinnova API)
- RSS feeds

**Pipeline:**
1. Scraper fetches data per configured source and frequency (daily at 08:00, weekly on Mondays at 08:00)
2. Data normalized to common schema (title, description, deadline, amounts, eligibility)
3. Deduplication check against existing grants (URL + title)
4. Stored in `grants` table with full `rawData` JSON preserved
5. AI eligibility extraction runs separately to parse structured criteria

**Automation:**
- Python scheduler daemon runs daily/weekly scraper batches
- `POST /api/cron/extract-eligibility` — triggers AI eligibility extraction
- `POST /api/cron/scrape` — triggers scrapers by frequency
- `POST /api/cron/project-health` — triggers project health checks
- All cron endpoints protected by `CRON_API_KEY`

---

### 4.5 Security

| Feature | Implementation |
|:---|:---|
| **Authentication** | Replit Auth (OpenID Connect), session-based |
| **Authorization** | Per-request user ID from session; IDOR prevention on all data access |
| **Rate Limiting** | Per-user rate limits on AI endpoints (10 extractions/day) |
| **Input Validation** | Zod schemas on all request bodies |
| **CRON Protection** | API key validation for cron endpoints |
| **Partner API Keys** | Scoped keys with read/write permissions |

### 4.6 Scheduled Jobs & Automation

| Task | Schedule | Source | Purpose |
|:---|:---|:---|:---|
| Daily Scrapers | 08:00 daily | `scrapers/scheduler.py` | Fetch new grants from daily-frequency sources |
| Weekly Scrapers | Monday 08:00 | `scrapers/scheduler.py` | Fetch grants from weekly-frequency sources |
| Nightly Stats Cache | 02:00 daily | `server/jobs/partnerJobs.ts` | Cache partner metrics (client counts, app stats, grant wins) |
| Invite Expiration | 09:00 daily | `server/jobs/partnerJobs.ts` | Expire pending partner invitation tokens |
| Partner Digest | Monday 07:00 | `server/jobs/partnerJobs.ts` | Send weekly email summaries to partners |
| Grant Cleanup | On server startup | `server/index.ts` | Close grants with past deadlines |
| Stripe Sync | On server startup | `server/index.ts` | Sync Stripe data and set up webhooks |
| Partner Maintenance | External cron | `POST /api/cron/partner-maintenance` | Stats refresh + invite cleanup (API key protected) |

---

## 5. UI/UX Design System

### 5.1 Component Library
Built on **shadcn/ui** (New York variant) with **Radix UI** primitives and **Tailwind CSS**.

**Core Components Used:**
- Card, CardHeader, CardContent, CardFooter
- Button (variants: default, outline, ghost, destructive)
- Badge (variants: default, secondary, outline + custom color classes)
- Tabs, TabsList, TabsTrigger, TabsContent
- Dialog, Sheet
- Form, Input, Textarea, Select, Slider, Switch, Checkbox
- Table, TableRow, TableCell
- Tooltip, TooltipTrigger, TooltipContent
- Sidebar, SidebarProvider, SidebarTrigger
- Skeleton (loading states)
- Toast (notifications)
- Separator

**Icons:** Lucide React throughout the app

### 5.2 Layout Structure

```
┌─────────────────────────────────────────────┐
│ SidebarProvider                              │
│ ┌──────┐ ┌────────────────────────────────┐ │
│ │      │ │ Header (14px height)           │ │
│ │      │ │ [≡] ──────── [🌐][🌓][👤]    │ │
│ │ Side │ ├────────────────────────────────┤ │
│ │ bar  │ │ Main (flex-1, overflow-auto)   │ │
│ │      │ │ ┌──────────────────────────┐   │ │
│ │      │ │ │ max-w-7xl mx-auto       │   │ │
│ │      │ │ │ <Router />              │   │ │
│ │      │ │ └──────────────────────────┘   │ │
│ └──────┘ └────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

- **Sidebar:** Collapsible, hidden on mobile. Contains navigation, partner section (if partner), admin section, market selector, version info
- **Header:** Fixed 56px bar with sidebar toggle, language switcher, theme toggle, user menu
- **Main Content:** Scrollable area with `p-3` on mobile, `p-6` on desktop. Content constrained to `max-w-7xl`

### 5.3 Theming

- **Light/Dark Mode:** CSS class-based (`darkMode: ["class"]`). Variables defined in `:root` and `.dark` in `index.css`. Toggle in header
- **Color System:** HSL-based CSS custom properties (space-separated format: `H S% L%`)
- **White-Label:** Dynamic branding via `WhitelabelProvider` context. Partners override: logo, favicon, platform name, primary/accent colors, font family, tagline, support info

### 5.4 Internationalization (i18n)

| Language | Code | Default For |
|:---|:---|:---|
| Swedish | `sv` | Sweden market |
| English | `en` | Fallback |
| Norwegian Bokmål | `no` | Norway market |
| Finnish | `fi` | Finland market |

- Framework: `react-i18next`
- Translation files: `client/src/i18n/{lang}.json`
- All UI text localized including: navigation, forms, buttons, error messages, grant-specific terms
- Dates formatted with `date-fns` locale (e.g., `sv` locale for Swedish date format)
- Currency follows market selection (SEK, NOK, EUR)

### 5.5 Responsive Design

| Breakpoint | Layout Changes |
|:---|:---|
| **Mobile (< 640px)** | Single column, sidebar hidden, reduced padding (p-3), smaller headings, stacked card layouts, collapsible filter sidebar |
| **Tablet (640-1023px)** | Two-column grant grid, sidebar still hidden |
| **Desktop (1024px+)** | Sidebar visible, two-column grant grid + filter sidebar, full padding |

**Key Patterns:**
- `overflow-hidden` + `min-w-0` on flex containers to prevent horizontal overflow
- `line-clamp-2` for text truncation
- `break-words` for long text content
- `shrink-0` on fixed-width elements (icons, badges)
- Responsive grid: `grid-cols-1 md:grid-cols-2`

### 5.6 Navigation (Sidebar)

**Regular User Items:**
- Dashboard
- Grants (Bidrag) — with badge for new matches
- Calendar (Kalender) — destructive badge for urgent deadlines
- Applications (Ansökningar)
- Projects (Projekt) — badge for urgent tasks
- Content Library (Bibliotek)
- Company Profile (Företagsprofil)
- Alerts (Bevakningar)
- Achievements (Framgångar)
- Pricing (Priser)
- Settings (Inställningar)

**Partner Section** (if partner role):
- Partner Dashboard
- Clients (Kunder)
- Branding (Varumärke)
- Domain (Domän)
- Analytics (Analys)
- Settings (Inställningar)

**Admin Section:**
- Users (Användare)
- Scraper Sources
- Scraper Logs
- Success Fee
- Settings (Inställningar)

**Footer:** Market Selector (SE/NO/FI) + Version string

---

## 6. User Journeys

### Journey 1: New User — First Visit to First Grant Match

```
Landing Page → "Get started for free" → Replit Auth Login
→ Onboarding Wizard appears:
  Step 1: Welcome
  Step 2: Select market (SE/NO/FI)
  Step 3: Enter website URL (or skip)
  Step 4: Review AI-extracted profile data, edit if needed, save
  Step 5: Set funding goals
  Step 6: Configure notifications
  Step 7: Completion → Redirect to Dashboard
→ Dashboard shows:
  - Top 3 matching grants
  - Profile completion suggestions
  - Progress tracker at "Browse Grants" step
```

**Time estimate:** ~5 minutes with AI extraction, ~10 minutes manual

---

### Journey 2: Grant Discovery and Evaluation

```
Dashboard → Click "Explore Grants" (or sidebar "Bidrag")
→ Grants Listing:
  - Default filter: Open + Upcoming, matching profile
  - Browse card grid, see match scores
  - Click match explanation to understand "why"
  - Adjust filters (source, deadline, amount)
  - Bookmark interesting grants (star icon)
→ Click "Visa detaljer" on a grant
→ Grant Detail:
  - Read full description and eligibility
  - View AI Match Analysis (strengths + concerns)
  - Run AI Eligibility Check for detailed verdict
  - Click "Ansök nu" to start application
```

---

### Journey 3: Writing a Grant Application

```
Grant Detail → "Ansök nu"
→ Application Wizard:
  Step 1: Review grant details + eligibility
  Step 2: Confirm company profile
  Step 3: Enter project information (description, goals, budget)
  Step 4: AI generates application sections
→ Edit & Refine:
  - Edit sections manually
  - Use "Regenerate" with custom instructions
  - Content Library suggests relevant past snippets
  - Run Compliance Check → fix flagged issues
→ Finalize:
  - Set status to "Ready" or "Submitted"
  - Export as DOCX or PDF
  - Submit via funder's official portal (external)
```

---

### Journey 4: Team Collaboration on Application

```
Application → Invite collaborator (email + role: viewer/editor/admin)
→ Collaborator receives email → Clicks invite link → Accepts
→ Both users see:
  - Real-time presence indicators (who's editing which section)
  - Comment threads on specific sections
  - Version history per section
  - Ability to restore previous versions
→ Shared applications appear in "Shared with me" view
```

---

### Journey 5: Post-Award Project Management

```
Application approved → Mark status as "Approved"
→ Create Project (from application or manually):
  - Enter approved amount, dates, funder portal URL
  - Quick Setup auto-generates milestones + budget categories
→ Ongoing Management:
  - Track milestones (drag-and-drop reorder, status updates)
  - Log expenses per budget category
  - Monitor burn rate and co-funding
  - Manage risks (probability × impact scoring)
  - Generate AI-drafted progress reports
  - Upload and organize project documents
  - Track team allocation and costs
→ Health Dashboard:
  - Overall status: On Track / At Risk / Delayed / Blocked
  - Visible on main Dashboard
```

---

### Journey 6: Success Fee Flow (Free Plan Users)

```
Free plan user → Finds matching grant → Starts application
→ Prompted with success fee terms:
  "Apply for free. Pay 3% only if you win (max 25,000 SEK)"
→ Accepts terms → Agreement created (status: pending)
→ Writes and submits application (external)
→ Reports outcome:
  - "Rejected" → Agreement closed, nothing owed
  - "Won" → Fee calculated (3% of approved amount)
    → Stripe invoice created → Payment collected
→ Dashboard shows: "Upgrade to Pro and save X kr/year"
  - If total fees exceed subscription cost, upgrade is suggested
```

---

### Journey 7: Partner White-Label Setup

```
User → Pricing page → Partner plans → "Become a Partner"
→ Registration form (company info, subdomain selection)
→ Partner Dashboard appears in sidebar
→ Setup flow:
  1. Branding: Upload logo, set colors, fonts, tagline
  2. Domain: Configure subdomain (default) or custom domain + DNS
  3. Invite first client via email
→ Client receives branded invitation email
→ Client visits branded login → Creates account
→ Client sees partner-branded version of GetGrant.ai
→ Partner monitors:
  - Client activity in Clients page
  - Usage analytics in Analytics page
  - Revenue via Settings → Billing
```

---

### Journey 8: Admin Operations

```
Admin logs in → Sees Admin section in sidebar
→ Scraper Management:
  - Monitor Sources page: check all scrapers are active
  - View Logs: filter by errors, identify failing sources
  - Manually trigger re-runs
  - Add new sources via source editor
→ User Management:
  - View user stats (growth, plan distribution)
  - Monitor active users
→ Success Fee Oversight:
  - Review flagged agreements
  - Send payment reminders for overdue fees
  - Adjust fee settings (percentage, caps, terms)
→ Eligibility Extraction:
  - Trigger batch AI extraction across all grants
  - Monitor extraction progress
```

---

## 7. Monetization Model

### 7.1 Subscription Plans (End Users)

| Feature | Free | Pro (795 kr/mo) | Enterprise (3,995 kr/mo) |
|:---|:---|:---|:---|
| Grant search & filters | Yes | Yes | Yes |
| View grant details | Yes | Yes | Yes |
| Bookmark grants | Yes | Yes | Yes |
| AI match scores | Limited | Yes | Yes |
| AI application writing | No | Yes | Unlimited |
| AI eligibility checks | No | Yes | Unlimited |
| Compliance checker | No | Yes | Yes |
| DOCX/PDF export | No | Yes | Yes |
| Email notifications | Basic | Full | Full |
| Grant alerts | 1 | Unlimited | Unlimited |
| Team collaboration | No | No | Yes (5 users) |
| API access | No | No | Yes |
| Success fee on wins | 3% | None | None |

### 7.2 Success Fee Model

- **Applies to:** Free plan users only
- **Rate:** 3% of approved grant amount
- **Minimum:** 500 SEK
- **Maximum cap:** 25,000 SEK per grant
- **Trigger:** User self-reports grant outcome (win/rejection)
- **Billing:** Stripe invoice generated automatically on win
- **Smart upgrade:** Dashboard suggests switching to Pro when cumulative fees exceed subscription cost

### 7.3 Partner Plans

| Feature | Starter | Professional | Enterprise |
|:---|:---|:---|:---|
| Client limit | 10 | 50 | Unlimited |
| Custom subdomain | Yes | Yes | Yes |
| Custom domain | No | Yes | Yes |
| Custom branding | Basic | Full | Full |
| API access | No | Limited | Full |
| Analytics | Basic | Advanced | Advanced + Export |
| Client self-signup | No | Yes | Yes |

---

## 8. Areas for Review

The following areas are suggested for developer/designer feedback:

### For Developers
1. **Scalability:** The eligibility overview endpoint checks all grants against the user's profile on every dashboard load. Consider caching or background processing as grant count grows
2. **Scraper Reliability:** 49 source modules with varying APIs/HTML structures. Monitoring and alerting for failures could be improved
3. **Real-time Collaboration:** Currently uses polling for presence and comments. WebSocket implementation would improve the experience
4. **Content Library Intelligence:** Currently basic keyword matching. Semantic search (embeddings) could significantly improve suggestion quality
5. **Rate Limiting:** Currently per-session for AI endpoints. Consider more granular, plan-based rate limiting
6. **Test Coverage:** The platform lacks automated unit/integration tests. Critical flows (billing, application generation) should have test coverage
7. **Error Handling:** AI service failures (Claude rate limits, outages) need more graceful degradation paths
8. **Database Performance:** Large JSON columns (rawData, eligibilityCriteria, sections) may impact query performance. Consider indexing strategy

### For Designers
1. **Information Density:** Dashboard packs many sections (stats, alerts, matches, eligibility, projects, agreements). Consider progressive disclosure or personalized ordering
2. **Mobile Experience:** Grant cards and application wizard steps need more mobile-optimized layouts
3. **Onboarding Flow:** 7 steps may feel long. Consider combining Goals + Notifications into one step
4. **Empty States:** Several pages lack engaging empty states (Content Library, Projects, Alerts)
5. **Visual Hierarchy:** Grant detail page has multiple analysis sections (rule-based + AI match + eligibility) that may confuse users. Consider consolidating
6. **Partner Branding:** Live preview is basic. A more interactive preview (simulated dashboard) would help partners visualize their brand
7. **Success Fee UX:** The fee acceptance flow during application start could feel like friction. Consider making it more seamless
8. **Calendar:** Currently shows both grant deadlines and project milestones without clear visual distinction. Color coding or separate views could help
9. **Navigation Depth:** Admin and Partner sections add significant sidebar length. Consider collapsible groups or a separate admin layout
10. **Accessibility:** Review color contrast ratios, keyboard navigation, and screen reader support across all custom components
