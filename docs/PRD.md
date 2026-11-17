# AI Lead Conversion & Voice Agent SaaS
## Product Requirements Document (PRD) — Version 0.1

**Product category:** AI-powered Lead Management, Voice Calling and WhatsApp Automation  
**Initial target market:** Real estate builders, developers and property consultants in India  
**Initial launch market:** Ahmedabad, Gujarat  
**Product model:** Multi-tenant SaaS  
**Primary languages:** Hindi, English and Gujarati  
**Document status:** Initial product specification

---

# 1. Product Vision

Build an AI-powered sales assistant that automatically manages customer enquiries and follows up with potential customers through phone calls and WhatsApp.

The business owner should not have to manually call every lead, answer repetitive questions or maintain spreadsheets.

The customer provides their lead data and approved business information. The AI agent handles eligible follow-ups, conversations, lead qualification and reporting.

The AI should behave like a professional sales receptionist, not a robotic answering machine.

## Core product promise

- Import customer phone numbers from Excel.
- Automatically contact eligible leads one by one.
- Understand whether a customer is interested.
- Answer questions using business-approved information.
- Capture customer requirements.
- Send and receive WhatsApp messages.
- Automatically follow up on new website enquiries.
- Identify hot, warm and cold leads.
- Notify the human sales team when intervention is needed.
- Maintain a complete conversation and call history.

# 2. Target Customers

## Initial customer segment

1. Real estate builders and developers.
2. Property consultants and brokers.
3. Residential project sales teams.
4. Commercial property sales teams.
5. Real estate lead-generation agencies.

## Future customer segments

- Automobile dealerships.
- Education institutes.
- Hospitals and clinics, subject to appropriate safeguards.
- Insurance and financial service businesses, subject to applicable sector regulations.
- Travel agencies.
- Home service providers.

The platform should be designed for multiple industries, but the first release should focus on real estate.

# 3. Main Product Modules

## Module A — Excel Lead Import & Automated Calling

### Objective

Allow a business to upload a list of customer phone numbers and let the AI contact eligible customers systematically.

### User workflow

1. Business owner opens the dashboard.
2. Selects Lead Campaigns.
3. Uploads an Excel or CSV file.
4. System reads and validates the data.
5. System displays a preview.
6. Business selects the calling campaign and approved script.
7. System checks consent, contact permissions, suppression lists and applicable calling restrictions.
8. Owner confirms the campaign.
9. AI calls eligible leads one by one.
10. System records the result of each call.
11. Dashboard updates automatically.

### Supported Excel fields

| Field | Required |
|---|---|
| Customer name | No |
| Phone number | Yes |
| Email | No |
| Preferred language | No |
| Budget | No |
| Preferred location | No |
| Property type | No |
| Consent evidence/reference | Required for applicable campaign permission |
| Additional notes | No |

### AI calling conversation

Example:

"Hello, am I speaking with Rahul?

I'm calling on behalf of ABC Builders regarding your property enquiry.

Is this a convenient time to talk?"

The agent should identify itself as an AI assistant when appropriate and clearly identify the business and purpose of the call.

It should then ask relevant questions:

- Are you currently looking to buy a property?
- Are you interested in residential or commercial property?
- What is your approximate budget?
- Which location do you prefer?
- Are you planning to purchase immediately or in the future?
- Would you like a callback from our sales team?
- Would you like to arrange a site visit?

### Call outcome classification

Every completed attempt should be classified.

| Outcome | Meaning |
|---|---|
| Interested | Customer wants to explore the property |
| Highly interested | Customer wants a sales callback or site visit |
| Follow-up required | Customer wants to speak later |
| Not interested | Customer declines |
| No answer | Call not answered |
| Busy | Customer is busy |
| Invalid number | Number is invalid |
| Wrong person | Contact does not belong to intended customer |
| Do not contact | Customer requests no further contact |
| Needs human assistance | AI cannot resolve the conversation |

### Campaign controls

- Start campaign.
- Pause campaign.
- Resume campaign.
- Stop campaign.
- Set calling hours.
- Configure retry policy.
- Set maximum attempts.
- Configure a daily calling limit.
- Exclude existing customers and opted-out contacts.
- Monitor live campaign progress.

**Important:** Uploading a phone number alone does not grant permission to make an automated promotional call. The platform must support the relevant consent, DND/preference checks, registered sender/telemarketer arrangements and approved calling infrastructure before campaigns can run.

---

## Module B — Website Enquiry Automation

### Objective

When a customer submits an enquiry on a builder's website, the AI should automatically process the lead and initiate an appropriate follow-up.

### Customer journey

1. Customer visits a property website.
2. Customer views a project.
3. Customer submits an enquiry form.
4. Website sends the lead to our platform through an API or webhook.
5. Platform creates a new lead.
6. AI identifies the relevant project and enquiry details.
7. Platform checks the customer's communication preferences and permission.
8. If an automated call is permitted, the AI calls the customer.
9. If calling is not permitted, the system can use an allowed response channel or assign the lead to a human.
10. AI records the conversation and updates the lead status.

### Example

Customer submits:

- Name: Rahul
- Phone: 9876543210
- Project: Green City
- Requirement: 3 BHK
- Budget: ₹80 lakh

The AI calls:

"Hello Rahul, thank you for enquiring about Green City.

I understand you're looking for a 3 BHK property with a budget around ₹80 lakh.

Would you like to know more about the available options?"

### Website integrations

- WordPress forms.
- Custom HTML forms.
- Next.js websites.
- CRM platforms.
- Third-party lead-generation platforms.
- Generic REST API and webhook integration.

### Lead response targets

- Receive and process a valid webhook within 5 seconds under normal operating conditions.
- Queue eligible follow-up actions immediately.
- Start the call only when the communication channel, consent, business schedule and provider rules permit it.

---

## Module C — WhatsApp AI Assistant

### Objective

Allow customers to communicate with the builder through its official WhatsApp Business channel.

The AI should answer questions, share approved property information and qualify leads.

### Two important WhatsApp workflows

#### 1. Customer sends a WhatsApp message

Example:

Customer: "I want information about your 3 BHK flats."

AI:

"Welcome to ABC Builders!

We can help you explore our 3 BHK properties.

May I know your preferred location and approximate budget?"

The AI should continue the conversation and capture the answers.

#### 2. Website enquiry followed by WhatsApp

When a website enquiry arrives, the system can send an approved WhatsApp template where the required opt-in exists.

Example:

"Hello Rahul, thank you for your enquiry about Green City by ABC Builders.

Would you like to receive more information about this project?"

If the customer replies, the AI can continue the conversation within the applicable WhatsApp customer-service window.

### WhatsApp capabilities

- Automated replies.
- Project information.
- Property details.
- Price information.
- Location and amenities.
- Brochure and approved media sharing.
- Lead qualification.
- Callback requests.
- Site visit requests.
- Human-agent handover.
- Conversation history.

### WhatsApp restrictions

- Use the official WhatsApp Business Platform or an authorised provider.
- Obtain the required opt-in.
- Use approved templates for business-initiated messages when required.
- Respect the 24-hour customer-service window.
- Provide a human escalation path.
- Do not use unofficial WhatsApp automation or browser hacks.

---

## Module D — Business Knowledge Base

### Objective

Give each business its own verified information so that the AI answers questions accurately.

### Business owner can upload

- Company information.
- Project descriptions.
- Property inventory.
- Floor plans.
- Brochures.
- Price lists.
- Amenities.
- Location details.
- Payment plans.
- Frequently asked questions.
- Sales policies.
- Contact information.

### Property inventory structure

| Field | Example |
|---|---|
| Project name | Green City |
| Property type | Residential |
| Configuration | 3 BHK |
| Location | Ahmedabad |
| Starting price | ₹80 lakh |
| Availability | 5 units |
| Carpet area | Approved value |
| Amenities | Clubhouse, garden |
| Possession date | Approved project date |

### Critical AI rules

1. Never invent a price.
2. Never invent property availability.
3. Never promise a discount without approval.
4. Never confirm a site visit unless the appointment system confirms it.
5. Never make legal or financial guarantees.
6. If information is missing, say that the sales team will confirm it.
7. Use only the relevant business's approved knowledge base.

---

## Module E — Lead Management Dashboard

### Objective

Give the business owner a clear picture of every lead and its status.

### Lead categories

- New
- Contact pending
- Contacted
- Interested
- Hot lead
- Warm lead
- Cold lead
- Follow-up required
- Site visit requested
- Site visit scheduled
- Converted
- Not interested
- Do not contact

### Lead details

Every lead record should contain:

- Customer name and phone.
- Source of enquiry.
- Project name.
- Call history.
- WhatsApp history.
- Conversation summary.
- Customer budget.
- Preferred property type.
- Preferred location.
- Interest level.
- Next follow-up date.
- Assigned sales representative.
- Consent and opt-out records.

### Lead filters

- Interested customers.
- Hot leads.
- Not interested.
- Follow-up required.
- No answer.
- Website enquiries.
- Excel campaigns.
- Project-wise leads.
- Date range.
- Assigned sales representative.

---

## Module F — Human Sales Team Handover

### Objective

AI handles repetitive communication while humans handle important sales conversations.

The AI should transfer or assign a conversation when:

- Customer requests a human.
- Customer is ready to purchase.
- Customer requests negotiation.
- Customer asks a question outside approved information.
- Customer becomes frustrated.
- A complaint or sensitive issue arises.
- A site visit needs manual confirmation.

The sales team should receive a notification with:

- Customer information.
- Lead score.
- Conversation summary.
- Customer requirements.
- Recommended next action.

---

## Module G — Analytics & Reports

Dashboard metrics:

- Total uploaded leads.
- Eligible leads.
- Calls attempted.
- Calls connected.
- Interested customers.
- Hot leads.
- Follow-ups required.
- Not interested.
- WhatsApp conversations.
- Website enquiries.
- Site visits requested.
- Site visits confirmed.
- Conversion rate.
- Cost per connected call.
- Cost per qualified lead.

Campaign reports should support Excel export.

---

# 4. AI Conversation Engine

The AI should support three communication modes.

### Voice mode

Speech-to-text → AI reasoning → approved business tools → text-to-speech.

### WhatsApp text mode

Incoming message → intent detection → approved knowledge retrieval → business tools → WhatsApp reply.

### Website enquiry mode

Webhook → lead creation → permission checks → automated follow-up workflow.

All three modes should use the same business data, lead records and conversation history.

The AI should support Hindi, English and Gujarati, including natural language switching when customers change languages.

---

# 5. Multi-Tenant SaaS Architecture

Each business must have an isolated workspace.

### Business account structure

- Platform administrator
- Business owner
- Sales manager
- Sales representative

### Tenant-specific information

Each business must have separate:

- Users and roles.
- AI agent configuration.
- Voice settings.
- Business knowledge.
- Projects and property inventory.
- Lead lists.
- Calling campaigns.
- Call recordings and transcripts.
- WhatsApp connections.
- Website integrations.
- Analytics and usage records.
- Billing and subscription settings.

One business must never be able to access another business's data.

---

# 6. Proposed Technology Architecture

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- UI/UX Pro Max design guidance

### Backend

- Python
- FastAPI
- REST APIs
- Webhooks
- Background job queue

### Database

- Supabase
- PostgreSQL
- Row-Level Security
- Supabase Storage

### AI and language processing

- OpenRouter for initial model experimentation
- Gemini or another suitable LLM as a model candidate
- Whisper/Faster-Whisper for speech recognition experiments
- TTS provider selected after language and commercial testing

### Real-time voice

- LiveKit candidate for real-time audio transport
- Approved telephony provider for phone calls

### WhatsApp

- Official WhatsApp Business Platform
- Approved WhatsApp Business Solution Provider if required

### Development and testing

- GitHub
- OpenHands or OpenCode after comparison
- Google Colab for AI experiments
- Playwright for browser testing
- Pytest for backend testing

Technology choices are provisional and must be validated for cost, reliability, language quality, API access and commercial licensing.

---

# 7. MVP Scope

The first release should prove that the product can reliably convert leads into qualified sales opportunities.

### MVP Phase 1 — Foundation

- Business registration and login.
- Business workspace.
- Basic dashboard.
- Project and property management.
- Knowledge base.
- Lead management.
- Excel/CSV import.
- Consent and suppression management.

### MVP Phase 2 — AI calling

- One business phone integration.
- Outbound calling for eligible leads.
- Hindi and English first.
- Gujarati validation.
- AI conversation.
- Call transcription.
- Call summary.
- Interest classification.
- Call outcome reporting.

### MVP Phase 3 — Website enquiries

- Webhook integration.
- Automatic lead creation.
- Permission-aware follow-up.
- AI callback.
- Lead status updates.

### MVP Phase 4 — WhatsApp

- Official WhatsApp Business connection.
- Incoming message handling.
- Approved automated responses.
- Project information retrieval.
- Lead qualification.
- Human handover.

### MVP Phase 5 — Reports and pilot

- Campaign dashboard.
- Call analytics.
- Lead export.
- Error monitoring.
- Usage tracking.
- Pilot with approximately three real estate businesses.

---

# 8. Out of Scope for Initial MVP

- International telephone numbers.
- Multiple telephony providers.
- Complex CRM integrations.
- Automated negotiation.
- AI-generated legal or financial advice.
- Automatic payment collection.
- Autonomous property booking.
- Fully automated sales closure.
- All-industry support.
- Large-scale bulk calling without validated compliance and capacity controls.

---

# 9. Security, Privacy and Compliance

This is a mandatory product requirement, not a later enhancement.

- Store only necessary customer data.
- Record the source and purpose of each lead.
- Store consent evidence and timestamps.
- Maintain suppression and Do Not Contact lists.
- Provide opt-out functionality.
- Apply role-based access controls.
- Encrypt sensitive data in transit and at rest.
- Restrict access to recordings and transcripts.
- Define retention and deletion policies.
- Log important agent actions.
- Never allow one tenant to access another tenant's records.
- Identify the business and AI assistant transparently.
- Provide human escalation.

For India, commercial calling must be designed around applicable TRAI requirements, including sender/telemarketer registration, calling resources, customer preferences and consent. WhatsApp must follow its opt-in, template and messaging-window policies. The DPDP Act and applicable Rules must be considered for personal-data processing.

The actual deployment and campaign workflow must be reviewed for regulatory compliance before launch.

---

# 10. Success Metrics

The pilot should measure:

| Metric | What it tells us |
|---|---|
| Successful webhook processing | Website integration reliability |
| Call connection rate | Contactability of eligible leads |
| AI conversation completion | Voice-agent quality |
| Correct lead classification | AI accuracy |
| Qualified lead rate | Sales usefulness |
| Follow-up completion | Automation reliability |
| WhatsApp response accuracy | Knowledge-base quality |
| Human handover success | Sales-team experience |
| Cost per qualified lead | Commercial viability |
| Customer opt-out rate | Contact experience and trust |

Do not optimise for call volume alone. The main business metric is qualified leads generated at an acceptable cost.

---

# 11. Initial Pilot Acceptance Criteria

The MVP is ready for a controlled pilot when:

1. A business can register and configure its workspace.
2. It can add a project and approved property information.
3. It can upload an Excel file and preview validated contacts.
4. It can exclude contacts without appropriate permission.
5. It can launch and pause an eligible campaign.
6. The AI can conduct a basic conversation.
7. Each call receives an accurate outcome record.
8. The AI can identify interest and capture requirements.
9. A website enquiry creates a lead automatically.
10. An eligible enquiry can trigger an appropriate callback.
11. A WhatsApp conversation can be handled using the official platform.
12. Human sales staff can take over a conversation.
13. Reports show lead status and communication history.
14. Tenant isolation and opt-out controls pass testing.

---

# 12. Business Model — Initial Proposal

Subscription-based SaaS with usage-based communication charges.

Potential plans:

- Starter: small businesses and limited usage.
- Growth: multiple campaigns and higher usage.
- Business: multiple agents and sales representatives.
- Enterprise: custom integrations, higher volumes and advanced controls.

Potential billing dimensions:

- Monthly platform subscription.
- Voice minutes.
- WhatsApp conversations/messages as applicable.
- AI usage.
- Optional integrations.

Pricing should be decided only after measuring actual provider and AI costs.

---

# 13. Product Roadmap

1. Architecture and detailed workflows.
2. SaaS foundation.
3. Business knowledge base.
4. Lead management and Excel upload.
5. AI calling prototype.
6. Lead qualification and reporting.
7. Website webhook integration.
8. WhatsApp integration.
9. Human handover and notifications.
10. Controlled real-estate pilot.
11. Improve reliability and reduce cost.
12. Expand to other industries.

---

# 14. Product Definition

This product is not simply an AI calling application.

It is an **AI Lead Conversion Platform** that combines:

- Automated outbound calling.
- Website lead follow-up.
- WhatsApp AI conversations.
- Business knowledge management.
- Lead qualification.
- Sales-team handover.
- Campaign management.
- Analytics and reporting.

Its main purpose is to reduce the time businesses spend on repetitive lead follow-up and help them identify genuine customers faster.