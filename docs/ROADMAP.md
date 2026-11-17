
# ROADMAP.md
# AI Lead Conversion Platform

## Project Goal

Build a multi-tenant AI Lead Conversion SaaS platform, initially targeting real estate builders and developers in India.

The first objective is to develop a working MVP and validate it with approximately three real estate businesses.

Development approach:
- Build incrementally.
- Test every major feature.
- Prefer free or low-cost services.
- Avoid unnecessary infrastructure.
- Do not activate paid services without explicit approval.
- Do not launch live campaigns without compliance and business approval.

---

## Phase 0 — Project Foundation

**Goal:** Prepare the development environment and project structure.

Tasks:

- [ ] Create GitHub repository.
- [ ] Configure GitHub Codespaces.
- [ ] Create frontend project using Next.js.
- [ ] Configure React and TypeScript.
- [ ] Configure Tailwind CSS.
- [ ] Create Python backend using FastAPI.
- [ ] Configure environment variables.
- [ ] Connect Supabase development project.
- [ ] Configure Git and `.gitignore`.
- [ ] Verify frontend and backend run independently.

Acceptance criteria:

- Frontend starts successfully.
- Backend starts successfully.
- Database connection works.
- Secrets are not committed to GitHub.

---

## Phase 1 — Database and Authentication

**Goal:** Build the secure foundation of the SaaS platform.

Tasks:

- [ ] Implement database migrations.
- [ ] Create tenant table.
- [ ] Create user and membership structure.
- [ ] Configure Supabase authentication.
- [ ] Implement tenant-level access control.
- [ ] Enable Row Level Security.
- [ ] Implement role-based permissions.
- [ ] Add audit logging.
- [ ] Write database security tests.

Acceptance criteria:

- Users can register and log in.
- A business owner can access their business workspace.
- Users cannot access another tenant's records.
- Unauthorized database operations are rejected.

---

## Phase 2 — Dashboard and Business Management

**Goal:** Build the core application interface.

Tasks:

- [ ] Create dashboard layout.
- [ ] Create sidebar navigation.
- [ ] Create dashboard overview.
- [ ] Create business profile settings.
- [ ] Create team management.
- [ ] Create user roles.
- [ ] Create project management.
- [ ] Create responsive layouts.
- [ ] Implement loading, error, and empty states.

Acceptance criteria:

- Business users can navigate the dashboard.
- Owners can manage business information.
- Users see only authorized sections and records.

---

## Phase 3 — Lead Management

**Goal:** Build the complete lead management workflow.

Tasks:

- [ ] Create lead listing page.
- [ ] Create lead detail page.
- [ ] Create manual lead form.
- [ ] Implement Excel/CSV upload.
- [ ] Validate uploaded file structure.
- [ ] Normalize phone numbers.
- [ ] Detect duplicate records.
- [ ] Display invalid records.
- [ ] Implement consent evidence tracking.
- [ ] Display eligible and excluded leads.
- [ ] Implement search and filters.
- [ ] Implement lead assignment.

Acceptance criteria:

- Business users can upload Excel/CSV files.
- Invalid and duplicate records are identified.
- Permission status is clearly visible.
- Unknown or unverified permission is not treated as approval.
- Leads can be assigned to sales representatives.

---

## Phase 4 — Campaign Management

**Goal:** Create controlled campaigns for eligible leads.

Tasks:

- [ ] Create campaign management interface.
- [ ] Create campaign configuration.
- [ ] Select eligible leads.
- [ ] Implement campaign review.
- [ ] Implement owner approval.
- [ ] Create campaign lead records.
- [ ] Implement database-backed job queue.
- [ ] Implement a controlled background worker.
- [ ] Implement retry and failure handling.
- [ ] Implement pause, resume, and cancellation.
- [ ] Add campaign activity logs.

Acceptance criteria:

- Campaigns cannot start without approval.
- Only eligible leads enter the processing queue.
- Permission and restrictions are checked again before communication.
- Jobs cannot be processed twice accidentally.
- Campaign processing respects provider limits and applicable rules.

---

## Phase 5 — AI Voice Agent

**Goal:** Build and test the AI voice conversation workflow.

Tasks:

- [ ] Evaluate AI model providers.
- [ ] Test structured output and tool calling.
- [ ] Implement approved business knowledge retrieval.
- [ ] Evaluate speech-to-text quality.
- [ ] Evaluate text-to-speech quality.
- [ ] Test Hindi conversations.
- [ ] Test English conversations.
- [ ] Test Gujarati conversations.
- [ ] Evaluate LiveKit integration.
- [ ] Evaluate compliant Indian telephony providers.
- [ ] Implement voice conversation flow.
- [ ] Implement lead qualification.
- [ ] Save call outcomes.
- [ ] Generate conversation summaries.
- [ ] Implement call failure handling.
- [ ] Implement human handover workflow.

Acceptance criteria:

- AI can conduct a controlled test conversation.
- AI can identify customer requirements.
- AI can answer only from approved business information.
- AI does not invent prices or property availability.
- Call outcomes are stored correctly.
- Human handover creates a usable sales-team task.

Important:

Do not make real outbound calls until the telephony setup, customer permissions, regulatory requirements, and provider policies have been reviewed.

---

## Phase 6 — WhatsApp AI Agent

**Goal:** Allow customers to communicate with businesses through official WhatsApp integration.

Tasks:

- [ ] Evaluate official WhatsApp Business Platform options.
- [ ] Configure test integration.
- [ ] Implement webhook verification.
- [ ] Receive inbound messages.
- [ ] Identify or create leads.
- [ ] Connect messages to conversations.
- [ ] Integrate approved knowledge base.
- [ ] Generate AI responses.
- [ ] Implement template messaging where required.
- [ ] Respect the applicable 24-hour customer-service window.
- [ ] Implement human handover.
- [ ] Save message delivery status.

Acceptance criteria:

- Inbound messages are received successfully.
- AI responds using approved business information.
- WhatsApp policy requirements are respected.
- Human representatives can take over conversations.

---

## Phase 7 — Website Enquiry Integration

**Goal:** Automatically capture new website enquiries.

Tasks:

- [ ] Design secure webhook API.
- [ ] Implement webhook authentication.
- [ ] Validate incoming enquiry data.
- [ ] Create leads automatically.
- [ ] Detect duplicate enquiries.
- [ ] Record communication permissions.
- [ ] Trigger eligible follow-up workflows.
- [ ] Implement webhook retry and logging.

Acceptance criteria:

- Website enquiries create lead records.
- Invalid requests are rejected.
- Duplicate submissions are handled safely.
- Follow-up is initiated only when legally and operationally permitted.

---

## Phase 8 — Reporting and Analytics

**Goal:** Give business owners visibility into lead conversion performance.

Tasks:

- [ ] Total leads dashboard.
- [ ] Eligible and excluded lead reports.
- [ ] Campaign performance reports.
- [ ] Call success reports.
- [ ] WhatsApp performance reports.
- [ ] Interested lead reports.
- [ ] Follow-up reports.
- [ ] Sales representative performance.
- [ ] Export reports.

Acceptance criteria:

- Dashboard numbers match database records.
- Reports are isolated by tenant.
- Metrics are clearly defined and accurate.

---

## Phase 9 — Testing and Security

**Goal:** Prepare the product for controlled pilot testing.

Tasks:

- [ ] Backend unit tests.
- [ ] API integration tests.
- [ ] Frontend tests.
- [ ] Playwright end-to-end tests.
- [ ] Tenant isolation tests.
- [ ] Permission and consent tests.
- [ ] Campaign queue tests.
- [ ] Webhook security tests.
- [ ] AI response quality tests.
- [ ] Provider failure tests.
- [ ] Security review.
- [ ] Compliance review.
- [ ] Data retention review.

Acceptance criteria:

- Critical business workflows pass tests.
- Tenant data cannot leak between businesses.
- Communication restrictions are enforced.
- Failure scenarios are handled safely.

---

## Phase 10 — Pilot Launch

**Goal:** Validate the product with approximately three real estate businesses.

Tasks:

- [ ] Set up pilot business accounts.
- [ ] Configure approved business information.
- [ ] Import authorized test leads.
- [ ] Train sales representatives.
- [ ] Test with synthetic data first.
- [ ] Obtain required approvals.
- [ ] Run controlled pilot campaigns.
- [ ] Collect customer and business feedback.
- [ ] Measure lead qualification performance.
- [ ] Measure response and conversion performance.
- [ ] Fix critical issues.

Acceptance criteria:

- Three pilot businesses can use the core workflow.
- Leads, conversations, and outcomes are recorded correctly.
- Business owners can understand campaign performance.
- Human sales teams can handle qualified leads.

---

## Development Priority

| Priority | Feature |
|---|---|
| P0 | Project foundation |
| P0 | Authentication and tenant isolation |
| P0 | Lead management |
| P0 | Consent and permission checks |
| P0 | Campaign approval and queue |
| P1 | AI voice agent |
| P1 | Human handover |
| P1 | Reporting |
| P2 | WhatsApp AI |
| P2 | Website integration |
| P3 | Billing and subscriptions |
| P3 | Multi-industry expansion |

---

## Development Rules

1. Complete one phase before moving to the next unless a documented dependency requires parallel work.
2. Do not implement all features in one large task.
3. Create small, reviewable Git commits.
4. Update documentation when architecture or requirements change.
5. Write tests for important business rules.
6. Never use real customer data in development without authorization.
7. Never bypass permission checks for testing convenience.
8. Do not add paid infrastructure without approval.
9. Record unresolved technical decisions.
10. Keep the MVP simple and maintainable.

---

## Current Status

Project stage: Documentation and planning.

- [x] Product concept
- [x] PRD
- [x] Architecture document
- [x] Database blueprint
- [x] README
- [x] AGENTS instructions
- [x] Git ignore rules
- [ ] Workflow documentation
- [ ] Database migrations
- [ ] Development environment
- [ ] MVP implementation
