
# WORKFLOW.md
# AI Lead Conversion Platform

## 1. Purpose

This document defines the business workflows of the AI Lead Conversion Platform.

The platform helps businesses manage leads, communicate with eligible customers, qualify prospects using AI, and improve sales conversions.

Initial target market: Real estate builders and developers in India.

Primary communication channels:

- AI voice calls
- Official WhatsApp Business Platform
- Website enquiries
- Human sales representatives

---

## 2. Main System Workflow

```text
                 BUSINESS OWNER
                       |
                       v
                Business Dashboard
                       |
          +------------+------------+
          |                         |
          v                         v
     Import Leads              Website Enquiry
     Excel / CSV               Webhook
          |                         |
          +------------+------------+
                       |
                       v
                  Lead Manager
                       |
                       v
             Validate Lead Records
                       |
             +---------+---------+
             |                   |
             v                   v
         Valid Lead          Invalid Lead
             |                   |
             v                   v
       Duplicate Check       Mark Invalid
             |
             v
       Consent Verification
             |
       +-----+------+
       |            |
       v            v
    Eligible     Excluded
       |            |
       |            v
       |       Review / Suppress
       |
       v
   Owner Reviews Campaign
       |
       v
   Campaign Approval
       |
       v
   Controlled Job Queue
       |
       v
   AI Voice / WhatsApp
       |
       v
   Customer Conversation
       |
       v
   Lead Qualification
       |
       +----------------------+
       |          |           |
       v          v           v
   Interested  Callback   Not Interested
       |          |           |
       v          v           v
   Sales Team  Follow-up   Update Status
   Handover    Task
       |
       v
   CRM and Analytics
```

---

## 3. Business Registration Workflow

### Step 1: Business Registration

A business owner creates an account.

Required information:

- Business name
- Owner name
- Email address
- Phone number
- Industry
- Website (optional)

### Step 2: Create Tenant

The backend creates a tenant record.

The registering user becomes the business owner.

### Step 3: Configure Business Profile

The owner configures:

- Business information
- Business address
- Timezone
- Supported languages
- Communication preferences
- Sales team members

### Expected Result

The business owner can access an isolated business dashboard.

No other business can access its data.

---

## 4. Lead Import Workflow

### Step 1: Upload File

The business owner uploads an Excel or CSV file.

Supported fields may include:

- Customer name
- Phone number
- Email
- Project name
- Budget
- Preferred location
- Property type
- Preferred language
- Communication permission evidence

### Step 2: File Validation

The backend checks:

- File type
- File size
- Required columns
- Missing values
- Invalid phone numbers
- Invalid email addresses
- Duplicate records

### Step 3: Data Preview

Display an import summary:

- Total rows
- Valid records
- Invalid records
- Duplicate records
- Records requiring permission review

The owner can review the results before final import.

### Step 4: Save Leads

Valid records are saved to the database.

Duplicate handling must follow a documented tenant-specific policy. Do not silently overwrite an existing lead.

### Step 5: Permission Review

The system checks available permission evidence.

Possible outcomes:

- Eligible
- Excluded
- Pending review

A phone number alone is not permission.

Unknown or insufficient permission must not be treated as granted.

### Expected Result

The owner can see all imported leads and their eligibility status.

No communication starts automatically from file upload.

---

## 5. Website Enquiry Workflow

### Step 1: Customer Submits Enquiry

A customer submits a form on the business website.

Example information:

- Name
- Phone number
- Email
- Project interest
- Budget
- Preferred contact channel
- Communication permission information

### Step 2: Webhook Request

The website sends an authenticated request to the backend.

### Step 3: Backend Validation

The backend validates:

- Webhook authentication
- Required fields
- Phone number
- Tenant identity
- Duplicate submission
- Permission evidence

### Step 4: Create Lead

The backend creates or updates the lead according to the duplicate-handling policy.

### Step 5: Follow-up Eligibility

The backend checks whether follow-up is permitted for the intended channel and purpose.

If permitted, the system can create a follow-up job.

Otherwise, the lead remains available for authorized manual handling or review.

### Expected Result

Website enquiries appear in the business dashboard.

No unauthorized automatic communication occurs.

---

## 6. Campaign Creation Workflow

### Step 1: Create Campaign

The business owner opens Campaign Management.

The owner enters:

- Campaign name
- Campaign channel
- Project (optional)
- Target lead criteria
- Campaign purpose
- Approved communication content
- Calling or messaging schedule
- Maximum concurrency
- Retry policy

### Step 2: Select Leads

The owner selects eligible leads or filters the lead database.

### Step 3: Eligibility Check

The backend checks:

- Verified permission
- Correct channel
- Correct communication purpose
- Withdrawal status
- Expiry status
- Suppression preferences
- Applicable calling hours
- Provider restrictions

### Step 4: Campaign Preview

Show:

- Total selected leads
- Eligible leads
- Excluded leads
- Pending-review leads
- Exclusion reasons

### Step 5: Owner Approval

The owner reviews the campaign and approves it.

Store:

- Approving user
- Approval timestamp
- Campaign configuration version
- Approved communication content version

### Step 6: Start Processing

After approval, the backend starts controlled queue processing.

Immediate processing means jobs begin entering the queue. It does not mean all customers are contacted simultaneously.

### Expected Result

Only approved and eligible campaign jobs are processed.

---

## 7. Campaign Queue Workflow

The queue controls the processing of approved campaign jobs.

### Job Lifecycle

```text
PENDING
   |
   v
QUEUED
   |
   v
PROCESSING
   |
   +----------+-----------+
   |          |           |
   v          v           v
COMPLETED   FAILED      RETRY
                          |
                          v
                    QUEUED AGAIN
```

### Before Each Communication Attempt

The worker must recheck:

1. Campaign approval is valid.
2. Campaign is not paused or cancelled.
3. Lead belongs to the correct tenant.
4. Permission is still valid.
5. Permission covers the channel and purpose.
6. Customer has not withdrawn permission.
7. Applicable communication restrictions are satisfied.
8. Provider concurrency and rate limits are respected.

### Retry Rules

- Use a limited retry policy.
- Do not retry permanent failures.
- Respect provider retry instructions.
- Do not repeatedly contact customers who have opted out.
- Record each attempt.
- Prevent duplicate jobs using idempotency controls.

### Campaign Controls

Business owners can:

- Pause campaigns.
- Resume campaigns.
- Cancel campaigns.
- View progress.
- View failures.
- Review individual lead outcomes.

---

## 8. AI Voice Call Workflow

### Step 1: Queue Worker Starts Call

The worker selects an eligible job.

It checks permission and restrictions again.

### Step 2: Initiate Provider Call

The backend requests a call through an approved telephony provider.

### Step 3: Customer Answers

The AI introduces itself and identifies the business it represents.

It should clearly communicate that the customer is interacting with an AI assistant where required by the approved script and applicable rules.

### Step 4: Understand Customer Requirements

The AI can ask:

- Are you interested in purchasing a property?
- Which project are you interested in?
- What is your preferred budget?
- What type of property are you looking for?
- How many bedrooms do you need?
- When are you planning to purchase?

The conversation must remain natural and respectful.

### Step 5: Retrieve Approved Information

The AI can retrieve information from the approved knowledge base and verified backend services.

Examples:

- Project details
- Location
- Property types
- Verified pricing
- Current inventory availability
- Approved appointment information

The AI must not invent missing information.

### Step 6: Identify Lead Outcome

Possible outcomes:

- Interested
- Not interested
- Needs more information
- Callback requested
- Appointment request
- No answer
- Busy
- Invalid number
- Communication refusal

### Step 7: Save Call Result

Store:

- Call status
- Duration
- Conversation summary
- Customer requirements
- Outcome
- Follow-up requirement
- Provider reference

### Step 8: Update Lead

Update the lead status and create an appropriate follow-up task.

### Expected Result

The business owner can view call history and qualified leads.

---

## 9. WhatsApp Conversation Workflow

Only the official WhatsApp Business Platform or an authorized provider may be used.

### Step 1: Customer Sends Message

A customer sends a WhatsApp message to the business's official number.

### Step 2: Receive Webhook

The provider sends the inbound message to the backend.

### Step 3: Validate Webhook

The backend verifies the webhook and identifies the correct tenant and business number.

### Step 4: Identify Lead

The backend finds an existing lead or creates one according to the business's lead creation rules.

### Step 5: Check Messaging Context

The system checks:

- Customer messaging permission and applicable policy requirements.
- Applicable 24-hour customer-service window.
- Template requirements.
- Customer preferences and restrictions.

### Step 6: AI Response

The AI retrieves approved business information and generates a response.

### Step 7: Send Response

The backend sends the message through the official provider.

### Step 8: Save Conversation

Store inbound and outbound messages, provider IDs, delivery status, and conversation summary.

### Step 9: Human Handover

If requested or necessary, assign the conversation to a human representative.

### Expected Result

Customers can communicate with the business through WhatsApp, subject to platform policies.

---

## 10. Lead Qualification Workflow

The AI evaluates customer responses and extracts structured information.

Example qualification fields:

- Customer name
- Interested project
- Budget range
- Property type
- Bedroom preference
- Preferred location
- Purchase timeline
- Financing requirement
- Preferred callback time
- Customer questions

### Qualification Categories

**Hot Lead**

Customer has strong interest and wants to speak with sales soon.

**Warm Lead**

Customer is interested but needs additional information or time.

**Cold Lead**

Customer has limited interest or is not currently planning to purchase.

**Not Interested**

Customer explicitly declines further sales communication.

These categories are business classifications, not permission to contact.

A lead marked hot must still pass communication permission checks before any further outreach.

---

## 11. Human Handover Workflow

### Trigger Conditions

Human handover may happen when:

- Customer requests a human.
- Customer wants to negotiate.
- AI cannot answer a question.
- Customer requests an appointment.
- Customer is highly interested.
- A complaint or sensitive issue occurs.

### Handover Process

1. Identify the appropriate sales representative.
2. Check representative availability.
3. Transfer the conversation if supported and available.
4. Otherwise, create a callback task.
5. Notify the assigned representative.
6. Attach the conversation summary.
7. Update lead status.
8. Record handover history.

### Expected Result

The sales team receives enough context to continue the conversation without asking the customer to repeat everything.

---

## 12. Follow-up Workflow

A follow-up can be created from:

- AI voice call
- WhatsApp conversation
- Website enquiry
- Manual sales activity
- Human handover

Each follow-up includes:

- Lead
- Assigned representative
- Due date
- Priority
- Reason
- Status

Before an automated follow-up is sent, communication eligibility must be checked again.

A callback task assigned to a human is not itself authorization for automated outreach.

---

## 13. Knowledge Base Workflow

### Step 1: Upload Business Information

Business owner uploads approved documents or enters information manually.

### Step 2: Process Information

Backend extracts and validates content.

### Step 3: Review

Business owner checks accuracy.

### Step 4: Approve

Only approved content becomes available to customer-facing AI agents.

### Step 5: Retrieve

During a conversation, the AI retrieves relevant approved information.

### Step 6: Update

When information changes, the owner updates or archives outdated content.

### Important Rule

Property prices, discounts, and availability must come from verified, current data sources.

Do not rely on outdated documents for time-sensitive information.

---

## 14. Dashboard and Analytics Workflow

The dashboard should show:

### Lead Metrics

- Total leads
- New leads
- Eligible leads
- Excluded leads
- Qualified leads
- Interested leads
- Converted leads

### Campaign Metrics

- Campaigns created
- Campaigns running
- Jobs processed
- Successful calls
- Failed calls
- Skipped leads

### Communication Metrics

- Total calls
- Answered calls
- Average call duration
- WhatsApp conversations
- Message delivery status
- Human handovers

### Sales Metrics

- Hot leads
- Warm leads
- Callback tasks
- Completed follow-ups
- Conversion rate

All metrics must be calculated from tenant-scoped database records.

Define each metric clearly and avoid treating attempted communication as a successful customer contact.

---

## 15. Error Handling Workflow

The platform must handle:

- Invalid uploads
- Database errors
- Authentication failures
- Webhook failures
- AI provider timeouts
- Speech recognition failures
- TTS failures
- Telephony failures
- WhatsApp provider failures
- Queue worker failures

### Error Handling Rules

1. Record useful diagnostic information.
2. Do not expose secrets in logs.
3. Retry only when appropriate.
4. Avoid duplicate processing.
5. Preserve campaign and lead status.
6. Notify users about important failures.
7. Allow authorized manual recovery.

---

## 16. Development and Testing Workflow

During development:

- Use synthetic leads.
- Use mock communication providers.
- Use test credentials.
- Do not call real customer phone numbers.
- Do not send real WhatsApp messages without explicit approval.
- Do not run production campaigns.
- Test consent and tenant isolation.
- Test failure and retry scenarios.

Production communication requires explicit approval, appropriate provider setup, and compliance review.

---

## 17. Core Workflow Acceptance Criteria

The MVP workflow is considered functional when:

1. A business owner can register and access a private workspace.
2. The owner can import an Excel/CSV lead file.
3. The platform identifies invalid and duplicate records.
4. The platform tracks permission evidence.
5. Leads without verified permission are excluded from the relevant campaign.
6. The owner can review and approve a campaign.
7. Approved eligible leads enter a controlled queue.
8. The worker rechecks eligibility before communication.
9. AI conversation outcomes are recorded.
10. Follow-up tasks can be assigned to sales representatives.
11. Tenant data remains isolated.
12. Campaign and communication activity can be audited.

---

## 18. Final Workflow Principle

The backend controls business rules.

The database stores verified information.

The AI understands conversations and generates responses.

The communication providers deliver calls and messages.

Human sales representatives handle important decisions and customer relationships.

No AI response can override customer communication preferences, permission checks, campaign approval, or verified business data.
