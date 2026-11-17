
# ARCHITECTURE.md — AI Lead Conversion SaaS

**Version:** 1.0
**Status:** Proposed MVP Architecture

## 1. Architecture Overview

We are building a cloud-first, multi-tenant AI Lead Conversion SaaS.

The platform will initially target real estate builders and property consultants.

The system will automate:
- Excel/CSV lead imports.
- Customer permission verification.
- Outbound calling campaigns.
- AI voice conversations.
- Website enquiry follow-ups.
- WhatsApp conversations.
- Lead qualification and sales handover.

The architecture must support multiple businesses with isolated data.

## 2. Technology Stack

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS
- Lucide Icons
- UI/UX Pro Max for design guidance

### Backend
- Python
- FastAPI
- Pydantic
- REST APIs
- Webhooks

### Database
- Supabase
- PostgreSQL
- Supabase Auth (subject to final authentication design)
- Supabase Storage
- Row-Level Security (RLS)

### AI and Language Models
- Groq Free tier for model inference.
- Gemini Free tier as the secondary, replaceable option.
- Structured outputs and tool calling for lead qualification.
- Model provider must remain replaceable; offline stub is the test default.
- No paid tier, paid token or payment method on file (₹0 budget).

### Voice Technology
- LiveKit as a real-time audio transport candidate.
- Whisper/Faster-Whisper for speech recognition experiments.
- TTS provider to be selected after Hindi, English and Gujarati testing.
- Telephony provider to be selected after checking Indian calling requirements.

### WhatsApp
- Official WhatsApp Business Platform.
- Authorised WhatsApp Business Solution Provider if required.

### Development and Testing
- GitHub for version control.
- Local development first; GitHub Codespaces Free only while it remains ₹0.
- OpenCode Free as the supervised AI coding agent.
- Google Colab for AI experiments.
- Pytest for backend testing.
- Playwright for frontend testing.
- Agent Browser for optional agent-driven browser testing.
- Every tool above must stay on a genuine free tier (no card, no auto-upgrade); fall back to offline stubs if a quota is hit.

## 3. High-Level System Architecture

```text
                 BUSINESS OWNER
                       |
                       |
                NEXT.JS DASHBOARD
                       |
                       |
                  FASTAPI API
                       |
          +------------+------------+
          |            |            |
       AUTH         LEADS       KNOWLEDGE
       SERVICE      SERVICE      SERVICE
          |            |            |
          +------------+------------+
                       |
                       |
             CAMPAIGN ORCHESTRATOR
                       |
                       |
              CONSENT / ELIGIBILITY
                       |
                       |
                 CAMPAIGN QUEUE
                       |
                       |
                BACKGROUND WORKER
                       |
            +----------+----------+
            |                     |
       VOICE SERVICE        WHATSAPP SERVICE
            |                     |
       TELEPHONY API        WHATSAPP API
            |                     |
       AI VOICE AGENT       AI MESSAGE AGENT
            |                     |
            +----------+----------+
                       |
                       |
               OUTCOME PROCESSOR
                       |
                       |
                SUPABASE DATABASE
                       |
                       |
                LEAD DASHBOARD
```

Website enquiries enter through authenticated webhooks and use the same lead and permission services.

## 4. Repository Structure

```text
ai-lead-conversion-saas/
│
├── AGENTS.md
├── README.md
├── PRD.md
├── ARCHITECTURE.md
├── DATABASE.md
├── WORKFLOW.md
├── ROADMAP.md
├── .gitignore
│
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── features/
│       │   ├── hooks/
│       │   └── lib/
│       └── package.json
│
├── services/
│   └── api/
│       ├── app/
│       │   ├── api/
│       │   ├── core/
│       │   ├── models/
│       │   ├── schemas/
│       │   ├── services/
│       │   └── main.py
│       └── requirements.txt
│
├── workers/
│   └── campaign-worker/
│
├── tests/
│   ├── backend/
│   ├── frontend/
│   └── integration/
│
├── infra/
│
├── decisions/
│   └── 0001-foundation-conventions.md
│
└── docs/
    ├── PRD.md
    ├── ARCHITECTURE.md
    ├── DATABASE.md
    ├── ROADMAP.md
    └── AGENTS.md
```

Do not create every directory immediately. Add folders as implementation tasks require them.

## 5. Main System Components

### 5.1 Authentication and Tenant Management

Responsibilities:
- Business registration.
- User authentication.
- Business workspace creation.
- User roles and permissions.
- Tenant isolation.

Roles:
- Platform administrator.
- Business owner.
- Sales manager.
- Sales representative.

Every business-owned record must be associated with a business ID.

### 5.2 Lead Management Service

Responsibilities:
- Create leads.
- Update lead information.
- Find duplicate contacts.
- Track lead sources.
- Assign sales representatives.
- Maintain lead activities.
- Schedule follow-ups.

Lead sources:
- Excel import.
- Website enquiry.
- WhatsApp.
- Manual entry.
- External CRM integration.

### 5.3 Excel Import Service

Responsibilities:
- Upload Excel and CSV files.
- Validate file format and size.
- Map spreadsheet columns.
- Validate phone numbers.
- Detect duplicates.
- Verify consent evidence.
- Exclude ineligible contacts.
- Generate import reports.

The import service must never assume that an uploaded phone number has permission for promotional communication.

### 5.4 Consent and Eligibility Service

This service is mandatory.

Responsibilities:
- Check permission evidence.
- Check communication purpose.
- Check channel permission.
- Check customer preferences.
- Check suppression records.
- Determine contact eligibility.

Possible results:

- ELIGIBLE
- EXCLUDED
- REVIEW_REQUIRED

The LLM must never make this decision.

### 5.5 Campaign Orchestration Service

Responsibilities:
- Create campaigns.
- Configure campaign settings.
- Approve campaigns.
- Start queue processing.
- Pause campaigns.
- Resume campaigns.
- Stop campaigns.
- Control concurrency.
- Schedule retries.
- Track campaign progress.

After owner approval, the system starts queue processing automatically, subject to configured and applicable restrictions.

### 5.6 Background Worker

Responsibilities:
- Claim eligible queue records.
- Check campaign status.
- Recheck suppression and eligibility.
- Check permitted calling hours.
- Dispatch calls.
- Receive provider events.
- Update call outcomes.
- Schedule permitted retries.

Workers must support:
- Idempotency.
- Failure recovery.
- Retry limits.
- Concurrency control.
- Rate limiting.

### 5.7 AI Conversation Service

Responsibilities:
- Understand customer questions.
- Retrieve approved business information.
- Ask qualification questions.
- Extract structured customer requirements.
- Generate conversation responses.
- Create call summaries.
- Classify lead interest.
- Request human assistance.

The AI must not invent:
- Property prices.
- Property availability.
- Discounts.
- Legal guarantees.
- Confirmed appointments.

### 5.8 Voice Service

Responsibilities:
- Connect the AI to phone calls.
- Handle speech input.
- Generate speech output.
- Maintain conversation sessions.
- Handle call events.
- Record permitted call metadata.

Voice provider and telephony provider must be replaceable.

### 5.9 WhatsApp Service

Responsibilities:
- Receive incoming messages.
- Verify incoming webhooks.
- Send permitted replies.
- Handle approved templates.
- Maintain conversation history.
- Handle opt-outs.
- Escalate to human agents.

Only official WhatsApp Business integrations are allowed.

### 5.10 Knowledge Base Service

Responsibilities:
- Store business information.
- Store project information.
- Store property inventory.
- Store brochures and documents.
- Retrieve relevant approved information.

Every knowledge query must be tenant-scoped.

### 5.11 Reporting Service

Responsibilities:
- Campaign reports.
- Call reports.
- Lead reports.
- Interest classification.
- Follow-up reports.
- AI usage.
- Provider costs.
- Conversion analytics.

## 6. Data Flow

### Excel Lead Flow

```text
Excel Upload
     |
File Validation
     |
Column Mapping
     |
Phone Validation
     |
Duplicate Detection
     |
Consent Verification
     |
Eligible / Excluded / Review
     |
Owner Campaign Approval
     |
Campaign Queue
     |
Background Worker
     |
AI Voice Agent
     |
Call Outcome
     |
Lead Dashboard
```

### Website Enquiry Flow

```text
Customer Website
       |
Enquiry Form
       |
Authenticated Webhook
       |
Lead Creation
       |
Consent Verification
       |
Permitted Follow-up
       |
AI Voice / WhatsApp
       |
Lead Update
```

### WhatsApp Flow

```text
Customer WhatsApp Message
          |
Official WhatsApp API
          |
Webhook Verification
          |
Business Identification
          |
Tenant Knowledge Retrieval
          |
AI Response
          |
Policy Validation
          |
WhatsApp Reply
          |
Conversation History
```

## 7. Multi-Tenant Architecture

Every business must have its own isolated data.

Tenant-specific resources include:
- Users.
- Leads.
- Campaigns.
- Contacts.
- Consent records.
- Projects.
- Property inventory.
- Agent settings.
- Conversations.
- Call records.
- WhatsApp integrations.
- Analytics.

Security requirements:
- Supabase Row-Level Security.
- Server-side tenant membership verification.
- Role-based permissions.
- No client-side trust in business IDs.
- Secure provider credentials.
- Tenant-isolation tests.

## 8. Cloud Infrastructure

Development environment:
- GitHub repository.
- Local FastAPI development server; GitHub Codespaces Free only while it remains ₹0.
- OpenCode Free as the supervised coding agent.
- Supabase Free development project.
- Groq/Gemini free-tier model APIs; offline stub by default.

AI experiments:
- Google Colab.
- Google Drive for notebooks and test assets.

Production environment (later):
- Cloud VM or managed hosting.
- Docker.
- FastAPI application.
- Background workers.
- Next.js hosting.
- Supabase or managed PostgreSQL.
- HTTPS and monitoring.

Colab must never host the production API, campaign worker or permanent telephony service.

## 9. Security Requirements

- HTTPS for external communication.
- Secure authentication.
- Tenant-level access controls.
- RLS policies.
- Secret management.
- API rate limiting.
- Webhook verification.
- Audit logging.
- Data retention policies.
- Secure file uploads.
- Opt-out enforcement.
- Human handover.

No production deployment or real campaign launch without explicit approval.

## 10. Reliability Requirements

- Idempotent campaign dispatch.
- Idempotent webhook processing.
- Retry limits.
- Worker recovery.
- Provider timeout handling.
- Campaign pause and stop controls.
- Failure monitoring.
- Structured application logs.
- Usage and cost monitoring.

## 11. Development Principles

1. Start with a modular monolith rather than microservices.
2. Keep frontend, backend and worker responsibilities clearly separated.
3. Keep AI providers replaceable.
4. Keep telephony providers replaceable.
5. Build simulated calling before real telephony.
6. Prefer free tiers for initial development.
7. Avoid unnecessary infrastructure.
8. Test each feature before proceeding.

## 12. Open Technical Decisions

The following require proof-of-concept testing before final selection:

- Authentication provider.
- Background queue technology.
- Telephony provider for India.
- LiveKit deployment approach.
- STT and TTS providers.
- Hindi and Gujarati voice quality.
- WhatsApp Business onboarding.
- Recording and transcript retention.
- Production hosting and operating costs.

## 13. Core Architecture Principle

The database stores business facts.

The backend enforces permissions and business rules.

The AI interprets customer conversations and requests approved actions.

The AI must never bypass backend validation or directly control campaign eligibility.
