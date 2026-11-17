# AI Lead Conversion & Voice Agent SaaS — PRD

## Version 0.2 · ₹0 Budget Edition (Supabase Free · Vercel Free · Groq/Gemini Free · OpenCode Free)

| Field | Value |
|---|---|
| Status | Version 0.2 — foundation Tasks 0.1–0.3 implemented; pinned free npm packages only; no paid services or spend |
| Date | 2026-11-17 |
| Supersedes | v0.1 — *AI Lead Conversion & Voice Agent SaaS, PRD Version 0.1* (17 November 2026) |
| Authoritative location | `docs/PRD.md` (per ADR-0001; root-level duplicates are legacy) |
| Related documents | `docs/ARCHITECTURE.md` (folder structure §4), `docs/DATABASE.md`, `WORKFLOW.md`, `docs/ROADMAP.md`, `decisions/0001-foundation-conventions.md` |
| Budget mandate | **₹0 development spend — no paid API.** Use only **Supabase Free**, **Vercel Free**, **Groq/Gemini Free tiers**, **OpenCode Free** and local/offline tooling. Any paid API, paid cloud resource, paid model tier, telephony credit or WhatsApp charge requires explicit written owner approval. |

> Legend: **[D]** = decision already recorded in the repository ADRs under `decisions/`. **[P]** = proposal in this PRD, pending owner confirmation. **[H]** = hypothesis that must be validated by an experiment; never treat as fact. Never turn an **[H]** into a business rule without validation.

---

## 0. How this PRD was produced

The old PRD was reviewed end-to-end and rebuilt using the PM skill files that were present in this repository at the time (those copied files have since been removed from `docs/`; no external service, account or paid tool was used). Paths below are historical provenance:

| Discipline | Skill files applied | What changed in this PRD |
|---|---|---|
| Product strategy | `docs/pm-product-strategy/skills/product-strategy/SKILL.md`, `product-vision/SKILL.md`, `value-proposition/SKILL.md`, `lean-canvas/SKILL.md`, `monetization-strategy/SKILL.md` | §2 Product Strategy Canvas, §3 six-part JTBD value proposition, §6 lean economics and monetisation hypotheses |
| Product discovery | `docs/pm-product-discovery/skills/opportunity-solution-tree/SKILL.md`, `identify-assumptions-new/SKILL.md`, `prioritize-assumptions/SKILL.md`, `brainstorm-experiments-new/SKILL.md`, `metrics-dashboard/SKILL.md` | §4 Opportunity Solution Tree, §5 eight-category assumption register with Impact × Risk triage and XYZ/pretotype experiments, §11 metric definitions and alert thresholds |

The `pm-product-strategy` plugin was used deliberately to make the PRD clearer: §2 follows its nine-section Product Strategy Canvas in order — **vision → market segments → relative costs → value proposition → trade-offs → key metrics → growth → capabilities → Can't/Won't → coherence check** — and §3 expands the value proposition with the six-part JTBD template. Uncertain claims are labelled **[H]** so that strategy is never confused with fact (§5).

Source of truth for implementation constraints: root `AGENTS.md`, ADR-0001 in `decisions/`, and the existing architecture/database/workflow/roadmap documents. Copied PM-skills files were removed from `docs/`; `docs/AGENTS.md` now points to the root `AGENTS.md`. Where the old PRD conflicted with ADR-0001 or the root `AGENTS.md`, this PRD follows the ADR and `AGENTS.md` and records the change in Appendix A.

---

## 1. Executive summary

### 1.1 Product promise

A multi-tenant AI Lead Conversion Platform for real-estate businesses in India. It turns imported spreadsheets and website enquiries into **consent-verified, traceable, human-ready sales opportunities**. AI handles repetitive follow-up and qualification; deterministic backend rules handle permission, compliance and business facts.

### 1.2 Why this rewrite was needed

The v0.1 PRD described the ambition well but had four gaps:

1. It listed paid integrations (telephony, LiveKit, hosted STT/TTS, paid LLM tiers) as candidates without a hard spending gate.
2. It mixed "what we will build" with unvalidated market claims; nothing was labelled as an assumption.
3. It had no opportunity→solution→experiment chain, no assumption triage and no metric definitions precise enough to test.
4. Its MVP phase order put AI calling ahead of the lead dashboard, conflicting with the approved priority order in root `AGENTS.md`.

### 1.3 Strategic choices (all **[D]/[P]**, not hypotheses)

| Choice | Decision |
|---|---|
| Beachhead | Real-estate builders, developers and property consultants in India, starting with Ahmedabad **[D]** |
| Initial language set | Hindi and English first; Gujarati validated before being enabled **[D]** |
| Budget posture | **₹0, free-tier-only stack:** Supabase Free (DB/auth/storage), Vercel Free (frontend hosting), Groq/Gemini free tiers (LLM), OpenCode Free (development agent), local/offline tests; simulated voice/WhatsApp by default. No paid API **[D]** |
| Delivery shape | Modular monolith; FastAPI + PostgreSQL job records; no Redis, no microservices **[D]** |
| MVP proof point | A controlled, simulated workflow that produces qualified leads with intact consent evidence — not call volume |
| North Star **[P]** | Weekly **consent-verified qualified leads handed to sales** per active workspace |
| OMTM for next quarter **[P]** | Percentage of new, permission-verified leads that receive a completed, logged follow-up attempt within one business day (simulated during development) |

### 1.4 The five non-negotiable rules

1. A phone number is **not** permission.
2. The AI never decides legal/permission eligibility; deterministic backend code does.
3. No live call, WhatsApp message or paid API during development without explicit approval; free-tier Groq/Gemini calls are allowed only within documented rate limits and with no payment method on file.
4. Tenant A can never read or affect Tenant B's data, even through a bug or a test helper.
5. Every requirement in this PRD must be testable with free, local tooling before it is called done.

---

## 2. Product Strategy Canvas

### 2.1 Vision

Options considered (product-vision skill):

| # | Draft vision | Assessment |
|---|---|---|
| V1 | "Automate every real-estate sales call with AI." | Too narrow; invites call-volume thinking and bypasses consent. |
| V2 | "Give every small builder the follow-up capacity of a large sales floor — without losing trust or control." | Achievable, customer-centred, captures the real pain. |
| V3 | "Replace salespeople with AI." | Contradicts human-handover and compliance rules. |

**Selected vision [P]:** *Give every small property business the follow-up capacity of a large sales floor — without losing trust, consent or control.*

It is aspirational but bounded by the ₹0, simulated-first development phase: we prove the workflow before we touch real telephony.

### 2.2 Market segments (defined by problem/JTBD, not demographics)

| Segment | JTBD ("When… I want… so I can…") | Desired outcome | Constraints | Priority |
|---|---|---|---|---|
| S1 — Owner-led real-estate sales team (beachhead) | When enquiries arrive from many channels, I want every legitimate enquiry followed up and classified, so I can spend my team's time on real buyers. | Faster first response; fewer missed leads; auditable consent. | Tiny budget; no compliance team; Hindi/English; wary of "robocalls". | First **[D]** |
| S2 — Sales manager / rep inside S1 | When a lead is handed over, I want the full context, so I don't ask the customer to repeat themselves. | Actionable tasks, clean history. | Mobile-first, low training tolerance. | With S1 |
| S3 — Multi-project developer | When several projects run campaigns, I want project-scoped reporting and strict separation, so I can attribute results. | Reliable per-project data. | More roles, more approvals. | After S1 validates **[H]** |
| Future industries | Automobile, education, healthcare, insurance, travel, home services **[D]** | — | Regulated sectors need extra safeguards. | Out of scope until S1/S3 proven |

### 2.3 Relative cost position

Deliberately **low-cost**, not premium: the approved stack is exactly **Supabase Free + Vercel Free + Groq/Gemini Free tiers + OpenCode Free**, with local/offline simulation and no paid provider commitments. Cost advantage is a *constraint and a learning tool*, not a claim of superior product. If a paid capability ever becomes necessary, it is a separate owner decision with measured unit economics (§6.4). **[D]**

### 2.4 Value proposition (summary; full version in §3)

For owner-led property businesses that lose enquiries because nobody can call everyone quickly, the platform imports and validates leads, blocks every contact without verified permission, runs controlled simulated follow-ups, and hands sales a qualified, contextual task. Unlike spreadsheets plus manual dialling — or aggressive calling tools that ignore consent — the platform makes consent and tenant isolation part of the workflow, not an afterthought. **[P]**

### 2.5 Trade-offs — what we explicitly will NOT do

- No real outbound calls, WhatsApp sends or paid model/telephony activation in development. **[D]**
- No AI-generated legal/financial advice, invented prices, invented availability, invented discounts or unconfirmed appointment confirmations. **[D]**
- No autonomous negotiation, booking, payment collection or sales closure. **[D]**
- No multi-industry support, international numbers, multiple telephony providers or complex CRM sync in the MVP. **[D]**
- No "bulk blast" calling; concurrency, hours, rate limits and owner approval are mandatory. **[D]**
- No Redis, microservices or heavyweight vector infrastructure until the simple version is proven. **[D]**
- No billing/subscriptions implementation before pricing is validated. **[D]**

### 2.6 Key metrics

See §11 for exact definitions. North Star: weekly consent-verified qualified leads handed to sales **[P]**. OMTM: share of eligible new leads with a completed, logged follow-up attempt within one business day **[P]**. Guardrails: zero consent bypasses, zero cross-tenant leaks, ₹0 spend.

### 2.7 Growth **[H]** (all channels must remain free)

| Motion | Proposed free channel | Validation |
|---|---|---|
| Founder-led / concierge pilot | Direct outreach to ~3 Ahmedabad real-estate businesses (already the pilot goal in `docs/ROADMAP.md`) **[D]** | E-1 in §4 |
| Content/trust | Free local demonstrations using synthetic leads; share consent-safe screenshots | E-2 |
| Partner referral | Property consultants' existing networks, only after pilot results exist | Only after E-1 passes |

No paid ads, no paid lead sources, no affiliate commissions. Unit economics are **unknown**; LTV/CAC cannot be claimed before pilot data exists. **[H]**

### 2.8 Capabilities — build vs. defer

| Capability | Approach | Reason |
|---|---|---|
| Tenant model, RBAC, RLS, audit log | Build now | Core legal/safety boundary **[D]** |
| CSV/XLSX parsing, phone normalisation, dedupe | Build with maintained open-source libraries | Deterministic, cheap to test |
| Consent/eligibility engine | Build now, deterministic, pure functions | Must be auditable; never delegated to LLM **[D]** |
| PostgreSQL-backed queue with row locking | Build now | Free, already approved **[D]** |
| Simulated call/message provider | Build now | Enables full workflow at ₹0 **[D]** |
| LLM reasoning | **Groq/Gemini free tiers only** behind a replaceable interface; offline stub is the test default **[D]** | No paid tokens; free-tier limits documented and monitored |
| STT/TTS, telephony, WhatsApp | Defer behind interfaces; offline fixtures/stubs only | No paid voice/messaging APIs in development **[D]** |
| Frontend hosting | Next.js app in `apps/web`, deployed to **Vercel Free**; local dev otherwise **[D]** | ₹0 hosting; no paid build minutes |
| Development agent | **OpenCode Free** for supervised coding **[D]** | ₹0 tooling; no paid seats or model subscriptions |
| BI/analytics tooling | SQL + in-app views first | Avoid paid dashboards |

### 2.9 Can't/Won't — defensibility

There is **no proven moat today**. The only credible long-term advantage **[H]** is an integrated system where consent evidence, tenant isolation, campaign approval, outcomes and handover context are inseparable — plus accumulated local language/conversation evaluation data collected with consent. This must be earned through the pilot; it must not be written into the PRD as a current asset. Avoid competitors' typical weakness: treating uploaded numbers as permission.

### 2.10 Coherence check

The vision (capacity without losing trust) → beachhead (small owner-led teams) → low-cost posture → trade-offs (no live/paid channels) → metrics (qualified leads + zero-bypass guardrails) → build list (tenant, import, consent, queue, simulation) all reinforce one another. The main tension: a no-live-channel product cannot prove real connection rates. Resolution: the pilot measures **workflow correctness and handover quality with simulated providers first**; live-channel validation is a separate, explicitly approved phase. **[P]**

---

## 3. Value proposition — six-part JTBD template

**Segment:** S1 — owner-led real-estate sales team in Ahmedabad.

| Part | Content |
|---|---|
| **1. Who** | Small builder/developer or property consultant, 1–10 sales reps, enquiries arrive by spreadsheet and website, no compliance team, no budget for calling software. **[D]/[P]** |
| **2. Why (problem/JTBD)** | When many enquiries arrive, they cannot follow all of them up fast; they need to identify genuine buyers without annoying people or breaking calling rules. |
| **3. What before** | Manual spreadsheet tracking, one rep dialling when time permits, missed enquiries, no record of who said what, no reliable consent trail, fear of complaints. |
| **4. How** | Import + validation + duplicate policy; deterministic consent/eligibility and suppression; owner-approved controlled campaigns; simulated AI conversation with approved knowledge; structured qualification; contextual handover task; tenant-scoped dashboard. |
| **5. What after** | Every permitted lead has a traceable follow-up attempt and a clear status; sales spends time on genuinely interested people; the owner can see funnel, exclusions and reasons; nothing is sent without valid permission. |
| **6. Alternatives** | (a) Spreadsheets + manual calls: cheap but slow and unauditable. (b) Traditional telecalling/CRM vendors: faster but costlier and often treat consent as a checkbox. (c) Generic chatbot: answers questions but does not own the lead workflow. (d) Do nothing: lose leads. **[H] — competitor claims must be validated, not asserted in marketing.** |

**Concise value proposition statement [P]:** *Never miss a permitted enquiry: import, qualify and hand over real-estate leads with consent built into every step — at zero development cost.*

**Positioning statement [P]:** *For small property businesses that cannot afford a full sales floor, the platform is a consent-first lead conversion workspace; unlike manual calling or aggressive auto-diallers, it proves why each lead was contacted and hands sales the context they need.*

---

## 4. Opportunity Solution Tree (discovery)

**Desired outcome [P]:** Within the controlled pilot, at least 40% of new permission-verified leads receive a logged, qualified follow-up attempt within one business day of arrival, with zero consent bypasses. Target is a **starting hypothesis**, to be recalibrated after baseline measurement.

| ID | Opportunity (customer voice) | Opportunity score **[P]** | Solutions to consider (≥3 each) | Fast experiment |
|---|---|---|---|---|
| O1 | "I can't reach everyone quickly; leads go cold." | High | S1a owner-approved simulated campaign queue; S1b manual callback task list; S1c website-inquiry auto-acknowledgement (permission-aware) | E-1 concierge test: run 20 synthetic leads manually through the intended flow; measure time-to-first-logged-attempt |
| O2 | "I can't tell which enquiries are genuine." | High | S2a structured qualification form after conversation; S2b AI summary + interest class; S2c sales rep scoring override with audit trail | E-2 Wizard-of-Oz: operator fills the qualification schema by hand for 20 synthetic conversations; measure agreement with rep judgement |
| O3 | "I'm worried about calling people who didn't agree." | High | S3a deterministic eligibility engine with reason codes; S3b immediate opt-out suppression; S3c owner-visible exclusion report | E-3 adversarial test set: 15 consent edge cases; success = 0 incorrect ELIGIBLE decisions |
| O4 | "I don't trust AI to quote prices or availability." | Medium-High | S4a approved KB only + "sales will confirm" fallback; S4b live DB lookup for verified inventory; S4c no-price mode during pilot | E-4 red-team prompt set; success = 0 invented prices/availability/appointments |
| O5 | "My team never gets the full context." | Medium | S5a handover task with summary + requirements; S5b in-app conversation timeline; S5c notification digest | E-5 pilot rep feedback after 10 handovers; success = ≥80% say they could continue without asking the customer to repeat |

### XYZ hypotheses (lean-experiment format)

- **E-1:** At least 60% of 3 pilot businesses will complete the import→preview→approval→simulated-campaign flow using only free tooling within one hour of onboarding.
- **E-2:** At least 70% of qualification summaries produced in a Wizard-of-Oz test will be judged usable by a sales rep without follow-up questions.
- **E-3:** 100% of invalid-consent cases in the adversarial set will be excluded or flagged for review — never marked ELIGIBLE.
- **E-4:** 0 invented facts across a 30-question red-team set covering price, availability, discount and appointment confirmation.
- **E-5:** At least 2 of 3 pilot owners will state they would continue using the workflow after a 2-week simulated pilot (behavioural signal: they complete a second campaign, not just a survey answer).

Experiments use **Your Own Data (YODA)** and skin-in-the-game: prefer completed workflows and repeated usage over stated interest. All experiments run with synthetic leads, local services and ₹0 spend. **[D]**

---

## 5. Assumption register and risk triage

Method: eight categories from `identify-assumptions-new`; Impact × Risk from `prioritize-assumptions` where Risk ≈ (1 − Confidence) × Effort. "Risk" below is qualitative (L/M/H). Confidence reflects *current evidence*, not hope.

| ID | Cat. | Assumption **[H]** | Conf. | Impact | Risk | Action | Test / threshold |
|---|---|---|---|---|---|---|---|
| A01 | Value | Owners will act on a qualified-lead list, not just call counts | M | H | M | Test | E-5: rep uses handover task in ≥80% of cases |
| A02 | Value | Faster first logged attempt increases genuine conversations | L | H | H | Test | E-1 + pilot baseline; measure change, do not assume |
| A03 | Value | Exclusion reports are valued, not seen as friction | L | M | M | Test | Ask owners to explain an exclusion report without prompting |
| A04 | Usability | CSV/XLSX upload + preview is simple enough without training | M | H | M | Test | E-1: 3/3 complete unaided |
| A05 | Usability | Sales reps will read AI summaries on a small screen | L | M | M | Test | E-5 with mobile view |
| A06 | Viability | A free pilot can produce enough signal to justify pricing talks | M | H | M | Test | E-5: 2/3 owners run a second campaign |
| A07 | Viability | Consent-first positioning beats "we call more" positioning | L | H | H | Test | E-1 message A/B using free landing page; measure completed onboarding, not clicks |
| A08 | Viability | Compliance review can be obtained before any live pilot | M | H | M | Test | Owner confirms review path before Phase 10 |
| A09 | Feasibility | CSV/XLSX parsing works offline with maintained free libraries | H | M | L | Proceed | Existing import spike + unit tests |
| A10 | Feasibility | PostgreSQL row locking is sufficient for controlled concurrency | M | H | M | Test | Two-worker race test; 0 double dispatch |
| A11 | Feasibility | Hindi/English qualification can be evaluated without paid APIs | M | M | M | Test | Offline transcript fixture set; ≥90% schema correctness |
| A12 | Feasibility | Gujarati quality is good enough to enable later | L | M | H | Test | Human review sample before enablement |
| A13 | Ethics | Opt-out must override every earlier consent and every channel | H | H | L | Proceed | T-CONS-003; must be 100% |
| A14 | Ethics | Simulated conversations must be labelled in every stored record | H | H | L | Proceed | T-SIM-001; no record without `provider=simulated` |
| A15 | Go-to-market | 3 pilot businesses can be reached through free channels | M | H | M | Test | E-1 outreach log; 3 confirmations |
| A16 | Go-to-market | Ahmedabad is the right first market | L | M | M | Test | Compare with one neighbouring city using free outreach data |
| A17 | Strategy | Tenant isolation + consent evidence is a repeatable differentiator | L | H | H | Test | E-3 + cross-tenant test suite; then competitor scan |
| A18 | Strategy | ₹0 constraint can be maintained through pilot | H | H | L | Proceed | Cost ledger must show ₹0; any spend triggers approval gate |
| A19 | Team | Owner can approve compliance/telephony decisions on time | M | H | M | Test | Decision log with dates before Phase 10 |
| A20 | Team | Free/local tooling is enough for tests and demo | M | M | L | Proceed | CI/test command runs with pinned free dependencies |

### Triage summary

| Quadrant | Assumptions | Handling |
|---|---|---|
| High impact, low risk → proceed | A09, A13, A14, A18, A20 | Implement with tests now |
| High impact, high risk → experiment first | A02, A07, A10, A12, A17 | Run the mapped test/experiment in §5 before committing scope |
| Medium impact / medium risk → monitor | A01, A03, A04, A05, A06, A08, A11, A15, A16, A19 | Schedule tests inside relevant phases |
| Low impact, high risk → reject/defer | None currently | Re-evaluate after pilot data |

**Rule:** no assumption in the "experiment first" quadrant may be described as a product capability in marketing or in acceptance criteria until its experiment passes. **[D]**

---

## 6. ₹0 budget mandate, lean economics and monetisation

### 6.1 Hard spend gate

| Category | Allowed now (₹0) | Forbidden without written owner approval |
|---|---|---|
| Development agent | **OpenCode Free** **[D]** | Paid agent plans, paid seats, paid model subscriptions |
| Frontend hosting | Local dev server + **Vercel Free** for `apps/web` **[D]** | Paid Vercel plans, paid build minutes, paid domains/CDN |
| Backend compute | Local machine (`services/api` via uvicorn), free CI-equivalent only | Paid VM, paid managed backend hosting, paid CI minutes |
| Database / auth / storage | **Supabase Free** development project only (PostgreSQL, Auth, Storage) **[D]** | Paid Supabase plan, paid add-ons, paid backups, paid storage |
| Queue | PostgreSQL job records with row locking in Supabase Free **[D]** | Redis, paid managed queue |
| AI model | **Groq Free / Gemini Free tiers only** behind a replaceable interface, supplied via environment variables; offline stub is the test default **[D]** | Any paid tier/token, paid keys, paid OpenRouter experimentation, card-on-file trials |
| Speech | Local/offline fixtures and stubs | Paid STT/TTS, hosted Whisper endpoints |
| Voice/SMS | Simulated provider only **[D]** | Real-number calls, SMS, telephony credit, registration fees |
| WhatsApp | None in development (simulated only) | Official API onboarding, BSP fees, template charges, live messages |
| Monitoring | Local logs + pytest output | Paid APM/logging |

Free-tier rule **[D]:** a "free" tier is acceptable only while it stays at ₹0 with no payment method on file, no auto-upgrade and documented usage limits. The moment a tier bills, requires a card, or exceeds its free quota, it is treated as paid and the approval gate applies. Groq/Gemini free-tier usage must stay inside published rate limits; if a limit is hit, fall back to the offline stub rather than upgrading.

Approval flow **[P]**: request → named provider + monthly worst-case cost → owner written approval → environment variable added via secret store → cost ledger entry → kill switch documented. No secrets in code or Git (root `AGENTS.md` §5, `.gitignore`). Free-tier keys (Supabase, Vercel, Groq/Gemini, OpenCode) follow the same secret-handling rule and carry `estimated_cost_inr = 0.00`.

**Kill switch [D]:** if any unexpected charge or trial conversion appears, disable the integration, rotate credentials and record an incident before continuing.

### 6.2 Lean canvas (condensed)

| Block | Content |
|---|---|
| Problem | Missed follow-ups; no consent trail; unreliable lead status; manual repetition |
| Solution | Import → validate → eligibility → approved campaign → simulated conversation → qualification → handover → dashboard |
| UVP | See §3 |
| Unfair advantage | None proven; see §2.9 |
| Segments | S1 first; S2 shares workspace; S3 later **[D]** |
| Channels | Free founder-led outreach, demos with synthetic data, referrals after pilot **[H]** |
| Revenue | Unknown; hypotheses in §6.4 |
| Cost structure (dev) | ₹0 by policy; effort is the only current cost |
| Key metrics | §11 |

### 6.3 Cost observability requirement

FR-093: even with zero spend, record `provider`, `attempt_count`, `estimated_cost_inr` (always 0.00 for simulated providers and approved free tiers) and `mode=simulated|live` per attempt. A monthly/phase review must be able to prove the ₹0 claim from these records. Any non-zero value without an approval reference is a failing test.

### 6.4 Monetisation hypotheses **[H]** — no pricing committed

| # | Strategy | How it would work | Fit / risk | Validation experiment |
|---|---|---|---|---|
| M1 | Free pilot → monthly workspace subscription | Flat monthly fee per business after pilot | Simple; risk = small businesses resist SaaS without proven lift | E-5; ask for a paid commitment only after second campaign, never during dev |
| M2 | Per-qualified-lead fee | Charge only for accepted qualified leads | Aligns with value; risk = disputes over "qualified" | Define metric first (§11), then shadow-bill pilots at ₹0 and measure acceptance |
| M3 | Platform fee + provider pass-through at cost | Subscription plus metered telephony/AI later | Mirrors real costs; risk = cost anxiety | Only model costs after providers are approved; never activate in dev |

Selection rule: choose only after E-1/E-5 and a real cost baseline exist. No price list in this PRD.

---

## 7. Users, roles and tenancy

| Role | Scope | Key permissions **[D]** |
|---|---|---|
| `platform_admin` | Platform | Manage tenant status; no routine access to tenant customer data |
| `business_owner` | One tenant | Configure workspace, approve campaigns, view all reports, manage users |
| `sales_manager` | One tenant | Assign leads, view campaigns, manage team tasks |
| `sales_rep` | One tenant | View assigned leads, update follow-ups, accept handovers |

Role names and lead/call status enums follow ADR-0001, not the outdated values in `docs/DATABASE.md` §4.2/§4.5/§4.10. Every business-owned record carries `tenant_id`; the server derives tenant from the authenticated session, never from a client body. Service-role credentials remain backend-only. **[D]**

---

## 8. Requirements

Priorities: **P0** = required for the first working slice; **P1** = required for MVP proof; **P2/P3** = later phases. Every FR has a test ID in §12.

### 8.1 Foundation and tenant isolation (P0)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-001 | Repo layout per `docs/ARCHITECTURE.md` §4: `apps/web` (Next.js, Vercel Free), `services/api` (FastAPI), `tests/backend\|frontend\|integration`; pinned free dependencies; OpenCode Free as dev agent; environment variables via examples only | Import succeeds with no secrets; `python3 -m pytest -q` passes; `apps/web` dev server boots **[D]** |
| FR-002 | Business registration and login | Owner can register and log in; invalid credentials rejected; password/secret never logged |
| FR-003 | Workspace/tenant creation on registration | Exactly one tenant linked to the registering owner |
| FR-004 | Role-based permissions per §7 | Rep cannot approve campaigns; unauthorised action returns 403 |
| FR-005 | Tenant isolation on every read/write and in workers | Cross-tenant attempt returns 404/403 and writes nothing (T-ISO-001/002) |
| FR-006 | Audit log for approvals, consent changes, opt-outs, exports, role changes | Actor, tenant, timestamp and action recorded; no secrets/PII in metadata |

### 8.2 Lead import (P0)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-010 | Accept CSV and XLSX uploads with size/type limits | Valid file previewed; wrong type/oversize rejected with clear error |
| FR-011 | Validate required phone field and optional fields; never execute formulas/macros | Formula/macro cells treated as inert text or rejected; report lists row-level errors |
| FR-012 | Normalise phone numbers to a documented Indian format before dedupe | Equivalent formats collapse to one canonical value |
| FR-013 | Tenant-scoped duplicate policy; never silently overwrite | Duplicate rows reported with existing lead reference; owner chooses skip/update explicitly **[D]** |
| FR-014 | Preview before commit: total/valid/invalid/duplicate/review counts | No lead is saved before preview confirmation |
| FR-015 | Commit leads with source=`excel_import` and row provenance | Re-import is idempotent for the same file version |
| FR-016 | Capture consent evidence, channel, purpose, source and timestamp per row | Missing evidence → `unknown`, never `granted` |
| FR-017 | Check suppression list during import | Suppressed numbers are flagged and cannot enter campaigns |

### 8.3 Consent and eligibility — deterministic (P0)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-020 | Eligibility engine returns `ELIGIBLE`, `EXCLUDED`, `REVIEW_REQUIRED` with reason codes **[D]** | Unknown/denied/withdrawn/expired or channel/purpose mismatch never yields ELIGIBLE |
| FR-021 | Recheck eligibility immediately before every attempt | Consent withdrawn after queueing blocks dispatch (T-CONS-002) |
| FR-022 | Opt-out (`do_not_contact`) suppresses all channels for that tenant immediately | Existing queued jobs skipped; no retry (T-CONS-003) |
| FR-023 | LLM cannot read/write eligibility or override the engine | No AI tool exposed for consent changes; test attempts to prompt-inject fail |
| FR-024 | Evidence is append-only; withdrawal history preserved | A withdrawn consent is never overwritten as if it never existed |

### 8.4 Campaigns and controlled queue (P0)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-030 | Create campaign with channel, purpose, project, schedule, limits, approved content version | Draft cannot dispatch |
| FR-031 | Owner approval records user, timestamp and config/content version | No job queued before approval (T-CAMP-001) |
| FR-032 | Postgres-backed job queue with row locking and idempotency keys **[D]** | Two workers cannot claim the same job (T-QUEUE-002) |
| FR-033 | Worker rechecks tenant, approval, campaign status and eligibility | Paused/cancelled campaign dispatches nothing |
| FR-034 | Pause/resume/cancel with visible progress | In-flight jobs stop at next safe boundary |
| FR-035 | Bounded retries; no retry on permanent failure or opt-out | Attempt cap respected; permanent failures not retried (T-QUEUE-003) |
| FR-036 | Calling/messaging hours, concurrency, daily limit and rate limit | Outside-hours jobs rescheduled, not sent |
| FR-037 | Cost gate before dispatch | Any non-simulated provider without approval reference is rejected |

### 8.5 Simulated communication (P0/P1)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-040 | Simulated provider implements the same interface as a future real provider | Every attempt stores `provider=simulated`, `mode=simulated` (T-SIM-001) |
| FR-041 | Outcome capture using ADR-0001 enums: `interested`, `highly_interested`, `follow_up_required`, `not_interested`, `no_answer`, `busy`, `invalid_number`, `wrong_person`, `do_not_contact`, `needs_human_assistance` **[D]** | Every completed attempt has exactly one valid outcome |
| FR-042 | Fixture-based transcript and summary generation (no external API) | Summary derived from fixture transcript; deterministic in tests |
| FR-043 | Provider failure injection (timeout, 5xx, duplicate callback) | Worker recovers, no duplicate outcome, retry limit honoured (T-PROV-001) |

### 8.6 AI conversation service (P1)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-050 | Tenant-scoped approved knowledge retrieval; only `approved` content is visible | Cross-tenant KB query returns nothing (T-ISO-003) |
| FR-051 | Structured qualification: project, budget, property type, location, timeline, callback preference | Output validates against a schema; unknown fields are `null` or `unknown` |
| FR-052 | Hindi and English first; Gujarati behind a validation flag **[D]** | Language fixtures pass or the flag blocks enablement |
| FR-053 | Guardrails: no invented price, availability, discount or confirmed appointment | 30-question red-team set passes (E-4) |
| FR-054 | Human handover creates a task with summary, requirements and recommended action, plus notification | Handover never confirms an appointment |
| FR-055 | Model/provider interface replaceable; offline stub default; Groq/Gemini free tier selectable via env flag | Tests never require a network, API key or paid token |

### 8.7 Lead dashboard (P1)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-060 | Lead list and detail with call/message history, consent state, source, project | All data tenant-scoped; PII masked by role where applicable |
| FR-061 | Filters: hot leads, follow-up required, no answer, source, project, date, assignee **[D]** | Filter results match DB counts |
| FR-062 | Campaign progress and failure view | Counts derived from job records, not caches |
| FR-063 | Metrics from tenant-scoped database records **[D]** | Every displayed metric has a definition in §11 |
| FR-064 | Loading, empty and error states; responsive layout | States reachable via tests; no blank screen on API failure |

### 8.8 Website enquiry integration (P2)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-070 | Authenticated webhook with signature/token verification | Invalid signature rejected (T-WEB-001) |
| FR-071 | Idempotent processing using submission key | Duplicate submission does not create duplicate lead |
| FR-072 | Lead creation with source=`website` and captured consent fields | Missing required fields rejected; no silent defaults granting permission |
| FR-073 | Permission-aware follow-up job creation only when eligible | Ineligible enquiry becomes a human task, not an automated contact |

### 8.9 WhatsApp integration (P3)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-080 | Official WhatsApp Business Platform / authorised BSP only **[D]** | No unofficial automation, no browser hack |
| FR-081 | Webhook verification and tenant resolution by business number | Unknown number rejected |
| FR-082 | Opt-in, approved templates for business-initiated messages, 24-hour window | Out-of-window business-initiated send blocked |
| FR-083 | Human handover and opt-out handling | Opt-out stops further messages immediately |
| FR-084 | Development uses a simulated WhatsApp provider only | Zero live messages in dev (T-SIM-001) |

### 8.10 Analytics and reporting (P3)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-090 | Campaign, lead, follow-up and handover reports | Numbers match §11 definitions |
| FR-091 | Excel/CSV export of campaign results **[D]** | Export is tenant-scoped and audit-logged |
| FR-092 | Cost per connected call / qualified lead fields exist but stay N/A until real providers are approved **[D]** | No fabricated cost numbers |
| FR-093 | Cost ledger proving ₹0 development spend | Non-zero without approval reference fails (T-COST-001) |

### 8.11 Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-001 | Security | HTTPS outside local dev; secrets in environment/secret manager only; validation on all inputs; webhook verification |
| NFR-002 | Privacy | Data minimisation; retention/deletion policy defined before real data; recordings/transcripts restricted; DPDP considerations reviewed |
| NFR-003 | Compliance | TRAI/consent/DND considerations and WhatsApp policy reviewed before any live campaign **[D]** |
| NFR-004 | Reliability | Idempotent jobs/webhooks; bounded retries; worker recovery; provider timeouts; structured logs |
| NFR-005 | Tenancy | RLS + server-side membership checks; no client-supplied `tenant_id` trust **[D]** |
| NFR-006 | Cost | Default-deny for spend; every provider call tagged simulated/live and costed |
| NFR-007 | Maintainability | Modular monolith; small commits; no unapproved dependency; tests with each feature |
| NFR-008 | Performance | Enquiry webhook accepted and queued within 5s under normal load **[D]**; measured locally with synthetic traffic |
| NFR-009 | Testability | All core rules executable offline; no test depends on a paid service |
| NFR-010 | Accessibility/localisation | Keyboard-usable dashboard; Hindi/English strings where user-facing; Gujarati gated |

---

## 9. Core workflows (condensed; full detail in `WORKFLOW.md`)

1. **Registration → tenant:** register → create tenant → owner role → private workspace. Gate: tenant derived server-side.
2. **Import → eligibility:** upload → validate/normalise → preview → duplicate decision → save leads + consent evidence → suppression/eligibility status. Gate: upload alone starts **no** communication.
3. **Campaign → queue:** configure → select eligible leads → preview exclusions → owner approval → enqueue. Gate: approval recorded before enqueue.
4. **Worker → simulated call:** claim with row lock → recheck tenant/approval/consent/hours/rate/cost → dispatch to simulated provider → record outcome → schedule allowed retry or follow-up. Gate: recheck immediately before dispatch.
5. **Conversation → handover:** approved KB retrieval → qualification schema → summary → hot/handover triggers → task + notification. Gate: no invented facts, no confirmed appointment.
6. **Website enquiry:** authenticated webhook → idempotent lead creation → eligibility → permitted follow-up or human task. Gate: invalid signature rejected.
7. **Opt-out:** any channel → immediate `do_not_contact` → suppression across channels → cancel pending jobs → no retry. Gate: 100% enforcement.

---

## 10. Data alignment

Follow `docs/DATABASE.md` with ADR-0001 overrides: roles `platform_admin|business_owner|sales_manager|sales_rep`; lead statuses `new|contact_pending|contacted|interested|hot_lead|warm_lead|cold_lead|follow_up_required|site_visit_requested|site_visit_scheduled|converted|not_interested|do_not_contact`; call outcomes as listed in FR-041. Projects are **Phase 1** scope. Eligibility is `ELIGIBLE|EXCLUDED|REVIEW_REQUIRED`. Every business-owned table has `tenant_id` and RLS. Consent history is append-only. Billing tables are deferred. No raw provider secrets in `integrations`. **[D]**

Phase-1 table priority (from `docs/DATABASE.md` + ADR-0001): `tenants`, `users`, `projects`, `leads`, `lead_consents`, `imports`, `campaigns`, `campaign_leads`, `calls`, `follow_ups`, `audit_logs`. Add `conversations`, `messages`, `knowledge_base`, `integrations` in the AI phase; `notifications`, `subscriptions` later.

---

## 11. Metrics dashboard specification

Framework: North Star → input → health → business (metrics-dashboard skill). Every metric is tenant-scoped and computed from database records. Definitions marked **[P]** require owner confirmation before being reported externally.

| Layer | Metric | Exact definition | Source | Target / alert |
|---|---|---|---|---|
| North Star | Consent-verified qualified leads handed to sales / week | Count of leads with valid channel+purpose consent, ≥1 completed interaction, captured requirement, interest in `interested\|hot_lead\|warm_lead`, and ≥1 handover/follow-up task, created in the last 7 days | `leads`, `lead_consents`, `calls`, `follow_ups` | **[P]** Trend up weekly; alert if 0 for 2 weeks while new leads exist |
| Input | Eligible new-lead rate | `ELIGIBLE / (ELIGIBLE + EXCLUDED + REVIEW_REQUIRED)` for leads created in period | import/eligibility results | Observe baseline; alert if 0% or 100% (likely rule bug) |
| Input | First logged attempt within 1 business day | Eligible leads with first attempt recorded within 1 business day / eligible leads | `campaign_leads`, `calls` | **[P]** ≥90%; alert <70% |
| Input | Qualification completeness | Completed interactions with required qualification fields populated / completed interactions | `calls`, qualification schema | ≥90%; alert <80% |
| Input | Handover acceptance | Handover tasks accepted/actioned by a rep / handover tasks created | `follow_ups` | **[P]** ≥80% in pilot |
| Health | Consent bypass count | Attempts dispatched with no valid current consent or with opt-out present | audit + worker checks | **0; any occurrence is a P0 incident** |
| Health | Cross-tenant access attempts blocked | Rejected requests where `tenant_id` did not match session | API guards/audit | Must be blocked; investigate repeated attempts |
| Health | Worker success rate | Completed jobs / (completed + failed) per day | job records | ≥95%; alert <90% |
| Health | Duplicate dispatch count | Jobs processed more than once | idempotency log | **0** |
| Business | Development spend (INR) | Sum of approved charges + ledger entries | cost ledger | **Must be ₹0**; any non-zero without approval halts work |
| Business | Cost per qualified lead | Spend / qualified leads | cost ledger + North Star | N/A until real providers approved; never fabricate |
| Business | Opt-out rate | Opt-outs / completed interactions | `calls`, consent events | Monitor; spike triggers script review |

**Dashboard layout [P]:** North Star trend at top; four input sparklines; health guardrails as red/green counters; business row with ₹0 spend pinned. **Review cadence [P]:** daily health, weekly inputs, monthly North Star/business, quarterly strategy recalibration. **Alert routing [P]:** P0 consent/tenant/spend alerts to project owner immediately; other thresholds reviewed weekly.

Avoid vanity metrics: total calls, total leads and raw import counts are diagnostic context only; they never replace the North Star. **[D]**

---

## 12. Test strategy and acceptance matrix

All tests run locally with pinned free dependencies: `python3 -m pytest -q` (backend), Playwright later for the free frontend slice. No live provider, no real number, no paid API.

| Test ID | Covers | Scenario | Expected result |
|---|---|---|---|
| T-FND-001 | FR-001 / Task 0.1 | Health endpoint + unknown route | 200 `{"status":"ok"}`, 404 for unknown route |
| T-FND-002 | FR-001 / Task 0.2 | Missing/invalid env config; secret-like values | Clear validation error; no secret in logs; `.env*` ignored by Git |
| T-FND-003 | FR-001 / Task 0.3 | `apps/web` dev boot + Vercel Free config | Page renders, health link works, no secret in frontend bundle |
| T-ISO-001/002 | FR-005 | Cross-tenant read and write | Denied; no data leaked or mutated |
| T-ISO-003 | FR-050 | Cross-tenant knowledge query | Empty result |
| T-IMP-001 | FR-010/011 | Valid CSV/XLSX, bad type, formula cell | Preview/inert or reject; no execution |
| T-IMP-002 | FR-012/013/015 | Phone variants, duplicate, re-import | Canonicalised, reported, idempotent |
| T-CONS-001 | FR-020 | Missing/denied/expired/wrong-channel evidence | Never ELIGIBLE |
| T-CONS-002 | FR-021 | Consent withdrawn after queueing | Dispatch blocked |
| T-CONS-003 | FR-022 | Opt-out with queued jobs | Suppressed everywhere, no retry |
| T-CAMP-001 | FR-031 | Campaign started without approval | Rejected |
| T-QUEUE-002 | FR-032 | Two workers claim one job | Exactly one claim |
| T-QUEUE-003 | FR-035 | Retryable vs permanent failure | Bounded retry; no retry on permanent/opt-out |
| T-WKR-001 | NFR-004 | Worker crash mid-job and restart | Job recovered; no duplicate outcome |
| T-SIM-001 | FR-040/084 | Any simulated attempt | Tagged simulated; zero live calls/messages |
| T-PROV-001 | FR-043 | Timeout, 5xx, duplicate provider callback | Safe recovery, no duplicate result |
| T-AI-001 | FR-053 / E-4 | Price/availability/discount/appointment red-team | No invented facts; fallback response |
| T-AI-002 | FR-051/052 | Malformed or out-of-language fixture | Schema rejects or flag blocks; no crash |
| T-WEB-001 | FR-070/071 | Bad signature and repeated submission key | 401/403; one lead only |
| T-COST-001 | FR-093 | Cost ledger with unexpected non-zero | Fails until approval reference exists |
| T-UI-001 | FR-064 | Empty/loading/error states | Correct state rendered |

**Definition of done for every FR:** code + tests from this matrix passing + docs updated + no new spend + no secret committed. **[D]**

---

## 13. Delivery plan — MVP Phase 1 split into Task 0.1 / 0.2 / 0.3

The v0.1 "MVP Phase 1 — Foundation" is broken into five small, independently testable tasks below (numbered 0.x to match the foundation phase). Implementation order follows root `AGENTS.md` §4 (do not skip ahead). Task 0.5 only wires a labelled dummy API to the demo dashboard; it does not implement Phase 1 auth/tenancy or Phase 3 lead management. Auth/tenant work starts at Task 1.1 only after all five foundation tasks pass.
 Every task uses only the ₹0 stack from §6.1: Supabase Free, Vercel Free, Groq/Gemini Free tiers, OpenCode Free and local/offline tooling.

### 13.1 Task checklist

- [x] **Task 0.1 — Backend health slice (done).** FastAPI boots; `GET /health` → `{"status":"ok"}`; unknown route → 404; offline backend tests pass. Do not duplicate this work.
- [x] **Task 0.2 — Environment examples + config validation (done).** Placeholder-only `.env.example`; validated `app.core.config.load_settings`; no real secret, no secret in logs, `.env*` ignored by Git.
- [x] **Task 0.3 — Frontend shell + folder alignment (done).** `apps/web` Next.js app builds locally and is Vercel Free compatible; minimal page calls the backend health endpoint; tree matches `docs/ARCHITECTURE.md` §4. Verified 2026-11-17.
- [x] **Task 0.4 — Dummy dashboard preview (done).** Static, clearly labelled demo dataset at `/dashboard` with 20 synthetic leads; offline frontend checks pass.
- [x] **Task 0.5 — Dummy leads API + dashboard wiring (done).** In-memory `GET /leads` and `POST /leads` serve 20 synthetic leads; `/dashboard` fetches the list and posts new leads; loading, empty and error states included; `python3 -m pytest -q`, `tsc --noEmit` and `next build` pass. No database, auth or tenant logic is added.

### 13.2 Task details

| Task | Scope / files | Acceptance criteria | Test ID | Status |
|---|---|---|---|---|
| 0.1 | `services/api/app/main.py`, `tests/backend/test_health.py`, `pytest.ini`, `services/api/requirements.txt` | App imports without secrets; health 200; unknown route 404; `python3 -m pytest -q` green | T-FND-001 | **Done** — verified 2026-11-17: 2 passed (one harmless Starlette/anyio deprecation warning) |
| 0.2 | `services/api/.env.example`, `services/api/app/core/config.py`, `tests/backend/test_config.py`, `.gitignore` | Example values are placeholders; missing/invalid config fails with a clear error; no secret logged or committed; backend suite still green | T-FND-002 | **Done** — verified 2026-11-17: 15 passed (2 health + 13 config; one harmless Starlette/anyio deprecation warning) |
| 0.3 | `apps/web/` (Next.js + TypeScript), `tests/frontend/`, deployment config for Vercel Free | Build succeeds; health endpoint call and link are driven only by `NEXT_PUBLIC_API_BASE_URL`; structure matches ARCHITECTURE §4 (`apps/web`, `services/api`, `tests/backend\|frontend\|integration`); no secret in the frontend bundle | T-FND-003 | **Done** — verified 2026-11-17: pinned npm packages, offline frontend checks, `next build`, `tsc --noEmit` and pytest pass; ₹0 spend |
| 0.4 | `apps/web/src/app/dashboard/`, `tests/frontend/test_dashboard_offline.py` | Static dashboard preview at `/dashboard`, clearly labelled demo data; 20 unique synthetic leads; no backend connection | — | **Done** — verified 2026-11-17 |
| 0.5 | `services/api/app/api/leads.py`, `app/schemas/lead.py`, `app/services/lead_store.py`, `app/main.py`, `apps/web/src/app/dashboard/`, `apps/web/src/lib/leads.ts`, backend/frontend tests | `GET /leads` returns 20 synthetic items with `mode=dummy`; `POST /leads` validates and normalises phone, rejects duplicates with 409, and never lets a client grant permission; dashboard shows loading/empty/error states and an add-lead form; CORS limited to local Next.js origins | T-UI-001 (partial) | **Done** — verified 2026-11-17: 48 pytest passes, `tsc --noEmit`, `next build`, live uvicorn GET/POST smoke test; ₹0 spend |

Each task is done only when its test ID passes, docs are updated, spend stays ₹0 and no secret is committed (§12). Tasks 0.1 and 0.2 were implemented with no new dependencies; Task 0.3 adds pinned, free npm packages only and no paid service. Task 0.5 adds no dependency: its store is in-memory and process-local, so it is a wiring demo, not Phase 1 persistence, Phase 3 lead management or any tenant boundary.

### 13.3 Subsequent phases (order unchanged)

| Phase | Focus | Exit criteria |
|---|---|---|
| 0 | Foundation = Tasks 0.1–0.5: repo, pinned deps, config examples, local backend/frontend boot, labelled dummy dashboard and dummy `/leads` API | `python3 -m pytest -q` passes; no secrets; `apps/web` dev server boots; dashboard reads/writes the dummy API **[D]** |
| 1 | Database + auth/tenant/RLS, roles, audit | Register/login; isolated workspaces; T-ISO tests pass |
| 2 | Dashboard shell, business profile, projects/knowledge scaffolding | Owner can navigate and configure workspace |
| 3 | Lead management + CSV/XLSX import + consent evidence + suppression | Import tests T-IMP/T-CONS pass |
| 4 | Campaigns + approval + Postgres queue + worker + retries | T-CAMP/T-QUEUE/T-WKR pass; no live provider |
| 5 | Simulated calling first, then AI conversation/qualification/handover | T-SIM/T-AI/E-4 pass; Hindi+English fixtures |
| 6 | Lead dashboard polish + reports + cost ledger | Metrics match §11; T-COST passes |
| 7 | Website enquiry webhook | T-WEB passes |
| 8 | WhatsApp behind simulated provider / official integration only after approval | Policy tests; zero live messages in dev |
| 9 | Security, compliance, retention and full test pass | No P0 defects; review completed |
| 10 | Controlled 3-business pilot **[D]** | Explicit owner + compliance approval before any live channel |

---

## 14. Out of scope for the MVP

International numbers; multiple telephony providers; complex CRM integrations; automated negotiation; legal/financial advice; payment collection; autonomous booking or sales closure; all-industry support; live calling/WhatsApp in development; paid infrastructure; billing implementation; large-scale bulk campaigns; vector-search infrastructure; real customer data without authorisation. **[D]**

---

## 15. Compliance and ethics

- Transparent AI identification and business identification in any customer-facing script. **[D]**
- Human escalation always available; uncertain conversations escalate rather than guess. **[D]**
- Consent evidence, channel/purpose scope, withdrawal and expiry preserved with timestamps. **[D]**
- TRAI-related requirements (sender/telemarketer arrangements, preferences, DND), DPDP Act/Rules and WhatsApp Business policies require review before any live deployment. **[D]**
- Uploaded files and external messages are untrusted: no macro/formula execution, strict size/type checks, no raw content in logs. **[D]**
- No recording/transcript retention period is set until legal/business review; fixtures only during development. **[D]**

---

## 16. Open questions requiring owner decision

Q1 and Q6 from the earlier draft are resolved by this v0.2 update: the foundation tasks are defined in §13, and the free-tier/payment-method rule is fixed in §6.1. They are retained below for traceability.

| # | Question | Blocks | Proposed default until answered |
|---|---|---|---|
| Q1 | Resolved: Task 0.1 = existing health slice, 0.2 = env/config, 0.3 = frontend shell (§13) | — | Tasks 0.1/0.2 done; Task 0.3 remains todo |
| Q2 | Confirm North Star and OMTM definitions in §1.3/§11 | External reporting | Use as internal draft only |
| Q3 | Confirm duplicate-lead policy (skip vs explicit update) | FR-013 | Skip + report; never overwrite silently |
| Q4 | Which phone format is canonical for Indian numbers? | FR-012 | E.164 with +91, documented with tests |
| Q5 | Approval path and reviewer for compliance before pilot | Phase 9/10 | No live channel |
| Q6 | Resolved: only genuinely ₹0 free tiers with no payment method on file; Groq/Gemini free tiers are permitted (§6.1) | Spend gate | Any billing or card requirement → owner approval |
| Q7 | Which synthetic dataset will be used for pilot demos? | Experiment datasets | Locally generated fixtures only |
| Q8 | Should root-level legacy docs be reconciled now or later? | Docs consistency | `docs/` is authoritative (ADR-0001) |

---

## 17. Traceability summary

| Strategic element | Requirement | Test | Phase |
|---|---|---|---|
| Trust/consent vision | FR-016–024 | T-CONS-001/002/003 | 1, 3, 4 |
| Capacity/JTBD S1 | FR-010–015, FR-030–037 | T-IMP-001/002, T-CAMP-001, T-QUEUE-002/003 | 3, 4 |
| No invented facts | FR-050–055 | T-AI-001/002, E-4 | 5 |
| Foundation / zero spend | FR-001, FR-093 | T-FND-001/002/003, T-COST-001 | 0 |
| Low-cost posture | FR-037, FR-093 | T-SIM-001, T-COST-001 | 0–10 |
| Tenant isolation | FR-005, FR-050 | T-ISO-001/002/003 | 1, 5 |
| Human handover | FR-054, FR-061 | T-UI-001, E-5 | 5, 6 |
| Pilot validation | E-1–E-5, §11 | Pilot dashboard review | 10 |

---

## Appendix A — changes from v0.1

1. Added explicit ₹0 budget mandate, spend gate, kill switch and cost ledger (FR-037/093, §6, §12).
2. Added strategy canvas, six-part JTBD value proposition, OST, eight-category assumption register with Impact × Risk triage and XYZ/pretotype experiments (§2–§5).
3. Replaced vague success metrics with exact metric definitions, sources, targets and alert thresholds (§11).
4. Reordered phases to match root `AGENTS.md` priorities; dashboard moved ahead of AI voice (§13). "Simulated calling" is now a distinct gate before AI voice.
5. Aligned roles, status enums and project phasing with ADR-0001 (§7, §8.5, §10).
6. Added test IDs and definition-of-done for every requirement (§8, §12, §17).
7. Marked all unvalidated claims as **[H]** and added open questions (Q1–Q8); removed implied commitments to paid providers.
8. Clarified `docs/PRD.md` as authoritative; root copies are legacy (document control).
9. Named the exact ₹0 free stack — Supabase Free, Vercel Free, Groq/Gemini Free tiers and OpenCode Free — and rewrote the spend gate so these are explicitly allowed while every paid API remains forbidden (§1.3, §2.3, §2.8, §6.1, FR-001, FR-055).
10. Replaced the single Task 0.1 with the foundation task list: 0.1 done, 0.2 env/config, 0.3 frontend shell, each with acceptance criteria and a test ID (§12, §13).
11. Aligned repo layout and hosting wording with `docs/ARCHITECTURE.md` §4 (`apps/web`, `services/api`, `tests/...`) and made the nine-section `pm-product-strategy` canvas explicit (§0, §2).
12. Replaced OpenRouter/OpenHands with Groq/OpenCode in `docs/ARCHITECTURE.md` §2/§8 and implemented Task 0.2 (§13): `.env.example`, config validation with masked secrets, and 13 offline tests.

## Appendix B — glossary

| Term | Meaning |
|---|---|
| Consent evidence | Auditable record of permission source, channel, purpose, wording version and timestamp |
| Eligibility | Deterministic backend decision: ELIGIBLE / EXCLUDED / REVIEW_REQUIRED |
| Qualified lead **[P]** | Lead with valid consent, completed interaction, captured requirement, qualifying interest and a sales task |
| Simulated provider | Local implementation of provider interface that records attempts without external communication or cost |
| OMTM | One Metric That Matters for the current quarter |
| YODA | Your Own Data — validate with your own experiment data, not other people's market reports |
| Skin in the game | Validation based on real behaviour/commitment, not stated opinions |
