
# DATABASE.md
# AI Lead Conversion Platform

## 1. Database Overview

**Database:** PostgreSQL  
**Platform:** Supabase  
**Architecture:** Multi-tenant SaaS  
**Primary ID:** UUID  
**Timestamps:** TIMESTAMPTZ  
**Naming convention:** snake_case

### Core principles

1. Every business has isolated data.
2. Every business-specific record must belong to a tenant.
3. Use UUIDs for primary keys.
4. Store timestamps in UTC.
5. Use foreign keys to maintain relationships.
6. Use database constraints to protect data integrity.
7. Use Row Level Security (RLS) for tenant isolation.
8. Never store API keys or passwords in ordinary application tables.
9. Store customer communication permissions with evidence and timestamps.
10. Do not allow the AI model to independently decide whether a customer is eligible for communication.

---

## 2. Database Modules

The database is divided into these modules:

| Module | Responsibility |
|---|---|
| Tenants | Business accounts |
| Users | Business team members |
| Projects | Real estate projects |
| Inventory | Property units and availability |
| Leads | Customer information |
| Consent | Communication permission |
| Imports | Excel/CSV uploads |
| Campaigns | Outbound campaigns |
| Calls | Voice call records |
| Conversations | AI interaction history |
| Messages | WhatsApp messages |
| Knowledge Base | Approved business information |
| Follow-ups | Sales team tasks |
| Notifications | Team notifications |
| Integrations | External provider configurations |
| Audit Logs | Important system activities |
| Billing | Subscription and usage records |

---

## 3. Database Relationships

```text
tenants
  |
  |---- users
  |
  |---- projects
  |       |
  |       |---- inventory
  |
  |---- leads
  |       |
  |       |---- lead_consents
  |       |---- calls
  |       |---- conversations
  |       |---- messages
  |       |---- follow_ups
  |
  |---- imports
  |
  |---- campaigns
  |       |
  |       |---- campaign_leads
  |
  |---- knowledge_base
  |
  |---- integrations
  |
  |---- notifications
  |
  |---- audit_logs
  |
  |---- subscriptions
```

All business-owned records must be linked to their tenant.

---

## 4. Table Definitions

### 4.1 tenants

Stores registered businesses.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| name | TEXT | Business name |
| slug | TEXT | Unique business slug |
| industry | TEXT | Real estate, education, etc. |
| email | TEXT | Business email |
| phone | TEXT | Business phone |
| website | TEXT | Business website |
| timezone | TEXT | Business timezone |
| default_language | TEXT | Default communication language |
| status | TEXT | active, suspended, trial |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

### 4.2 users

Stores business team members.

Supabase Auth manages authentication credentials. This table stores application-level user information.

| Column | Type | Description |
|---|---|---|
| id | UUID | References auth.users.id |
| tenant_id | UUID | References tenants.id |
| full_name | TEXT | User name |
| email | TEXT | User email |
| role | TEXT | owner, admin, manager, agent |
| status | TEXT | active, inactive |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

A user must not access another tenant's data unless an explicitly authorized platform-level role is implemented.

### 4.3 projects

Stores real estate projects.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| name | TEXT | Project name |
| description | TEXT | Project description |
| location | TEXT | Project location |
| property_type | TEXT | Apartment, villa, plot, etc. |
| price_min | NUMERIC | Minimum price |
| price_max | NUMERIC | Maximum price |
| status | TEXT | active, inactive |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

### 4.4 inventory

Stores property units and availability.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| project_id | UUID | Project ID |
| unit_number | TEXT | Property unit number |
| property_type | TEXT | Unit type |
| bedrooms | INTEGER | Bedroom count |
| area_sqft | NUMERIC | Area |
| price | NUMERIC | Current price |
| availability_status | TEXT | available, reserved, sold |
| last_verified_at | TIMESTAMPTZ | Last inventory verification |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

AI responses about availability and prices must use verified backend data. Never rely on an old AI-generated answer for current inventory.

### 4.5 leads

Stores customer leads.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| project_id | UUID | Optional project ID |
| assigned_user_id | UUID | Assigned sales representative |
| full_name | TEXT | Customer name |
| phone | TEXT | Normalized phone number |
| email | TEXT | Customer email |
| preferred_language | TEXT | Hindi, English, Gujarati |
| source | TEXT | Website, Excel, WhatsApp, manual |
| budget_min | NUMERIC | Minimum budget |
| budget_max | NUMERIC | Maximum budget |
| preferred_location | TEXT | Preferred location |
| property_type | TEXT | Preferred property |
| bedrooms | INTEGER | Preferred bedrooms |
| lead_status | TEXT | new, contacted, qualified, interested, not_interested, converted, invalid |
| notes | TEXT | Internal notes |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

**Important:**

- Normalize phone numbers to a consistent international format.
- Do not assume a lead is contactable because a phone number exists.
- Consider encryption or restricted access for personal information.
- Use a tenant-scoped uniqueness strategy for duplicate detection, with an explicit policy for handling shared phone numbers.

### 4.6 lead_consents

Stores permission and communication preference evidence.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| lead_id | UUID | Lead ID |
| channel | TEXT | voice, whatsapp, sms, email |
| purpose | TEXT | Intended communication purpose |
| status | TEXT | granted, denied, withdrawn, expired, unknown |
| source | TEXT | Website form, imported evidence, etc. |
| evidence_reference | TEXT | Evidence location or reference |
| consent_text_version | TEXT | Version of consent wording |
| granted_at | TIMESTAMPTZ | Permission timestamp |
| withdrawn_at | TIMESTAMPTZ | Withdrawal timestamp |
| expires_at | TIMESTAMPTZ | Expiry timestamp |
| created_at | TIMESTAMPTZ | Record creation time |

**Eligibility rules:**

- Unknown permission means not eligible.
- Denied permission means not eligible.
- Withdrawn permission means not eligible.
- Expired permission means not eligible.
- Eligibility must be checked again before communication.
- Permission must cover the intended channel and purpose.
- Imported records must retain their evidence source.
- Keep an auditable history of permission changes.

The application must enforce these rules. The AI model must never determine consent eligibility.

### 4.7 imports

Tracks uploaded Excel and CSV files.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| uploaded_by | UUID | User ID |
| file_name | TEXT | Original filename |
| storage_path | TEXT | Supabase Storage path |
| file_type | TEXT | XLSX, CSV |
| total_rows | INTEGER | Total records |
| valid_rows | INTEGER | Valid records |
| invalid_rows | INTEGER | Invalid records |
| duplicate_rows | INTEGER | Duplicate records |
| eligible_rows | INTEGER | Permission-eligible records |
| status | TEXT | uploaded, processing, review, completed, failed |
| created_at | TIMESTAMPTZ | Upload time |

Never treat successful file import as permission to contact imported customers.

### 4.8 campaigns

Stores outbound campaign information.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| created_by | UUID | User ID |
| name | TEXT | Campaign name |
| channel | TEXT | voice, whatsapp |
| project_id | UUID | Optional project |
| status | TEXT | draft, pending_approval, approved, queued, running, paused, completed, cancelled |
| scheduled_at | TIMESTAMPTZ | Optional scheduled time |
| approved_at | TIMESTAMPTZ | Approval time |
| approved_by | UUID | Approving user |
| started_at | TIMESTAMPTZ | Processing start |
| completed_at | TIMESTAMPTZ | Completion time |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

Campaign approval must be recorded before queue processing starts.

### 4.9 campaign_leads

Connects leads to campaigns and tracks individual processing outcomes.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| campaign_id | UUID | Campaign ID |
| lead_id | UUID | Lead ID |
| eligibility_status | TEXT | eligible, excluded, pending_review |
| processing_status | TEXT | pending, queued, processing, completed, failed, skipped |
| exclusion_reason | TEXT | Reason for exclusion |
| attempts | INTEGER | Attempt count |
| next_attempt_at | TIMESTAMPTZ | Next permitted attempt |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

Add a unique constraint on `(campaign_id, lead_id)`.

Before each call or message, recheck current permission, suppression preferences, applicable calling hours, and provider restrictions.

### 4.10 calls

Stores voice call records.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| lead_id | UUID | Lead ID |
| campaign_id | UUID | Optional campaign |
| provider_call_id | TEXT | External provider ID |
| direction | TEXT | inbound, outbound |
| status | TEXT | queued, ringing, answered, completed, failed |
| duration_seconds | INTEGER | Call duration |
| recording_path | TEXT | Optional recording reference |
| transcript_path | TEXT | Optional transcript reference |
| summary | TEXT | AI-generated summary |
| outcome | TEXT | interested, not_interested, callback, no_answer, etc. |
| started_at | TIMESTAMPTZ | Call start |
| ended_at | TIMESTAMPTZ | Call end |
| created_at | TIMESTAMPTZ | Record creation |

Recordings and transcripts must be stored securely with appropriate access controls and retention policies.

### 4.11 conversations

Stores interaction sessions.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| lead_id | UUID | Lead ID |
| channel | TEXT | voice, whatsapp, website |
| external_session_id | TEXT | Provider session reference |
| status | TEXT | active, completed, handed_over |
| language | TEXT | Conversation language |
| summary | TEXT | Conversation summary |
| started_at | TIMESTAMPTZ | Start time |
| ended_at | TIMESTAMPTZ | End time |
| created_at | TIMESTAMPTZ | Creation time |

### 4.12 messages

Stores WhatsApp and other supported text messages.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| conversation_id | UUID | Conversation ID |
| lead_id | UUID | Lead ID |
| provider_message_id | TEXT | External message ID |
| direction | TEXT | inbound, outbound |
| sender_type | TEXT | customer, ai, human, system |
| message_type | TEXT | text, template, media |
| content | TEXT | Message content |
| delivery_status | TEXT | pending, sent, delivered, read, failed |
| created_at | TIMESTAMPTZ | Message time |

Apply appropriate retention and privacy controls to message content.

### 4.13 follow_ups

Stores sales follow-up tasks.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| lead_id | UUID | Lead ID |
| assigned_user_id | UUID | Assigned representative |
| conversation_id | UUID | Optional conversation |
| title | TEXT | Task title |
| description | TEXT | Task details |
| due_at | TIMESTAMPTZ | Due time |
| status | TEXT | pending, completed, cancelled |
| priority | TEXT | low, medium, high |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

### 4.14 knowledge_base

Stores approved business information used by AI agents.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| project_id | UUID | Optional project |
| title | TEXT | Document title |
| content | TEXT | Approved information |
| source_type | TEXT | manual, document, website |
| storage_path | TEXT | Optional source file |
| status | TEXT | draft, approved, archived |
| approved_by | UUID | Approving user |
| approved_at | TIMESTAMPTZ | Approval time |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

Only approved and current information should be available to customer-facing AI agents.

### 4.15 integrations

Stores tenant-specific integration metadata.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| provider | TEXT | Provider name |
| integration_type | TEXT | telephony, whatsapp, ai, etc. |
| status | TEXT | connected, disconnected, error |
| external_account_id | TEXT | Provider account reference |
| configuration | JSONB | Non-secret configuration |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

Do not store raw provider secrets in this table. Use a secure secrets-management mechanism.

### 4.16 notifications

Stores notifications for business users.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| user_id | UUID | Recipient |
| title | TEXT | Notification title |
| body | TEXT | Notification details |
| type | TEXT | lead, campaign, follow_up, system |
| is_read | BOOLEAN | Read status |
| created_at | TIMESTAMPTZ | Creation time |

### 4.17 audit_logs

Tracks important system activities.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| user_id | UUID | Actor, if applicable |
| action | TEXT | Action name |
| entity_type | TEXT | Affected entity |
| entity_id | UUID | Affected record |
| metadata | JSONB | Non-sensitive audit details |
| ip_address | INET | Optional client IP |
| created_at | TIMESTAMPTZ | Event time |

Never put passwords, API keys, access tokens, or unnecessary customer personal information in audit metadata.

### 4.18 subscriptions

Stores subscription and billing metadata.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenant_id | UUID | Business ID |
| plan_name | TEXT | Plan |
| provider | TEXT | Billing provider |
| external_subscription_id | TEXT | Provider subscription reference |
| status | TEXT | trial, active, past_due, cancelled |
| current_period_start | TIMESTAMPTZ | Period start |
| current_period_end | TIMESTAMPTZ | Period end |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

Billing integration is not required for the first MVP.

---

## 5. Important Database Constraints

The following rules must be implemented through PostgreSQL constraints, indexes, and application-level validation:

1. Every tenant-owned record must have a valid `tenant_id`.
2. Tenant relationships must be validated using tenant-aware foreign keys where appropriate.
3. Campaign lead combinations must be unique.
4. Phone numbers must be normalized before duplicate checks.
5. Campaign approval must identify the approving user and timestamp.
6. Communication jobs must be idempotent.
7. Consent history must be auditable.
8. A withdrawn permission must not be overwritten as if it had never existed.
9. Inventory availability must be checked against current database records.
10. Only approved knowledge-base content can be used in customer-facing responses.

Use appropriate indexes for frequently queried fields such as:

- `tenant_id`
- `lead_id`
- `phone`
- `campaign_id`
- `status`
- `created_at`
- `assigned_user_id`

Use composite indexes where query patterns require them.

---

## 6. Multi-Tenant Security

Supabase Row Level Security (RLS) is mandatory for tenant-owned data.

### Security requirements

- Enable RLS on tenant-owned tables.
- Authenticate users through Supabase Auth.
- Resolve the user's tenant membership through a trusted database relationship.
- Never trust a client-supplied `tenant_id` by itself.
- Restrict reads and writes to authorized tenant members.
- Check user roles for owner, admin, manager, and agent permissions.
- Keep service-role credentials on trusted backend services only.
- Do not expose service-role keys in frontend code.
- Validate tenant ownership in backend APIs and background workers.

RLS policies must be designed and tested before real customer data is used.

---

## 7. Storage Structure

Use Supabase Storage for files and large assets.

Suggested bucket structure:

```text
tenant-files/
  {tenant_id}/
    imports/
    knowledge-base/
    documents/

call-recordings/
  {tenant_id}/
    {call_id}/

call-transcripts/
  {tenant_id}/
    {call_id}/
```

Use private buckets and short-lived signed URLs where access is needed.

Apply retention policies to recordings, transcripts, and imported files.

---

## 8. Queue and Campaign Processing

For the first prototype, use PostgreSQL-backed job records rather than introducing Redis immediately.

Campaign processing flow:

1. Owner approves campaign.
2. Backend validates campaign configuration.
3. System evaluates lead eligibility.
4. Eligible records are added to the processing queue.
5. Worker claims a job safely.
6. Worker rechecks permission and restrictions.
7. Worker submits the call or message to the approved provider.
8. Provider status updates are recorded.
9. Outcomes and follow-up tasks are saved.

Use atomic database operations or safe row-locking strategies to prevent multiple workers from processing the same job.

Do not create an uncontrolled bulk-calling process.

---

## 9. Data Privacy and Retention

Customer information is sensitive.

Requirements:

- Collect only information required for the product.
- Restrict access based on business role.
- Protect recordings and transcripts.
- Establish retention and deletion policies.
- Record customer communication preferences.
- Support appropriate data access and deletion requests.
- Avoid sending unnecessary personal information to AI providers.
- Review data-processing arrangements with external providers.
- Apply applicable Indian privacy and communication requirements.

Retention periods must be configured only after legal and business requirements are reviewed.

---

## 10. Database Migration Strategy

Use version-controlled SQL migrations.

Suggested structure:

```text
backend/
  migrations/
    001_create_tenants.sql
    002_create_users.sql
    003_create_projects.sql
    004_create_inventory.sql
    005_create_leads.sql
    006_create_lead_consents.sql
    007_create_imports.sql
    008_create_campaigns.sql
    009_create_campaign_leads.sql
    010_create_calls.sql
    011_create_conversations.sql
    012_create_messages.sql
    013_create_follow_ups.sql
    014_create_knowledge_base.sql
    015_create_integrations.sql
    016_create_notifications.sql
    017_create_audit_logs.sql
    018_create_subscriptions.sql
```

Migration requirements:

- Never modify production schema manually without a tracked migration.
- Keep migrations reversible where practical.
- Test migrations against a development database.
- Add RLS policies and indexes through migrations.
- Use synthetic test data during development.

---

## 11. MVP Database Priority

Not every table is required on day one.

### Phase 1 — Core MVP

- tenants
- users
- leads
- lead_consents
- imports
- campaigns
- campaign_leads
- calls
- follow_ups
- audit_logs

### Phase 2 — AI and Communication

- conversations
- messages
- knowledge_base
- integrations

### Phase 3 — Real Estate and SaaS Expansion

- projects
- inventory
- notifications
- subscriptions

---

## 12. Open Database Decisions

These decisions require validation before implementation:

- Final authentication and tenant membership design.
- Whether a lead can belong to multiple projects.
- Whether shared phone numbers are allowed across leads.
- Consent evidence format and verification requirements.
- Call recording and transcript retention periods.
- Provider credential storage and rotation.
- Billing provider and subscription model.
- Whether vector search is needed for the knowledge base.

Do not introduce unnecessary database complexity before the MVP requires it.

---

## 13. Final Development Rule

The database is the source of truth for:

- Lead information
- Customer communication permissions
- Campaign approval
- Property prices
- Property availability
- Conversation outcomes
- Follow-up assignments

The AI model can interpret conversations and generate responses, but it must never independently change legal eligibility, invent inventory information, or bypass backend business rules.
