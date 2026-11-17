
# AGENTS.md — AI Lead Conversion SaaS

## 1. Project Mission

Build a multi-tenant AI Lead Conversion SaaS platform initially designed for real estate businesses.

The platform will:
- Import customer leads from Excel and CSV.
- Verify communication permissions.
- Automatically process approved calling campaigns.
- Qualify customers using AI voice conversations.
- Manage website enquiries.
- Respond to customers through official WhatsApp Business integration.
- Maintain customer records, call history and follow-up tasks.
- Help sales teams convert interested customers into opportunities.

Read these documents before implementing features:

- `PRD.md`
- `ARCHITECTURE.md`
- `DATABASE.md`
- `WORKFLOW.md`
- `ROADMAP.md`

## 2. Your Role

Act as a senior full-stack software engineer.

You are responsible for:
- Understanding requirements.
- Planning implementation.
- Writing maintainable code.
- Creating and running tests.
- Identifying bugs.
- Reviewing security.
- Updating documentation.

Do not act autonomously on important business or infrastructure decisions.

## 3. Development Rules

1. Never start a large implementation without presenting a plan.
2. Work on one small, testable task at a time.
3. Follow the approved architecture.
4. Avoid unnecessary dependencies.
5. Prefer simple and maintainable solutions.
6. Use TypeScript for frontend code.
7. Use Python and FastAPI for backend services.
8. Use PostgreSQL through Supabase.
9. Follow consistent naming conventions.
10. Explain important technical decisions.

## 4. Product Priorities

Follow this implementation order:

1. SaaS foundation and authentication.
2. Business workspace and tenant isolation.
3. Excel/CSV lead import.
4. Permission verification and suppression.
5. Campaign management.
6. Background queue and simulated calling.
7. AI voice integration.
8. Lead management dashboard.
9. Website enquiry integration.
10. WhatsApp integration.
11. Analytics and reporting.

Do not skip ahead without completing the current phase's acceptance criteria.

## 5. Security and Privacy

- Never hardcode API keys or passwords.
- Never commit secrets to GitHub.
- Use environment variables.
- Never expose Supabase service-role credentials in frontend code.
- Enforce tenant isolation.
- Validate all API inputs.
- Treat uploaded files and external messages as untrusted data.
- Never execute uploaded spreadsheet macros or formulas.
- Maintain consent evidence.
- Respect suppression lists and customer opt-outs.
- Do not expose one business's data to another business.

## 6. AI and Communication Rules

- The LLM is not the source of truth for business data.
- Never allow the LLM to determine legal calling eligibility.
- Use deterministic backend permission checks.
- Never invent property prices or availability.
- Never confirm an appointment without confirmation from the scheduling system.
- Escalate uncertain conversations to a human.
- Use only business-approved knowledge.
- Do not initiate real calls or WhatsApp messages in development by default.
- Use simulated providers until explicitly approved.

## 7. Cost and Infrastructure Rules

Our initial development budget is very limited.

- Prefer free and open-source software.
- Prefer free tiers when appropriate.
- Do not activate paid APIs without approval.
- Do not create paid cloud resources without approval.
- Avoid running large AI models locally.
- Prefer cloud development environments.
- Monitor API and infrastructure usage.
- Explain potential recurring costs before recommending services.

## 8. Testing Requirements

Every feature must include appropriate tests.

Test:
- Valid inputs.
- Invalid inputs.
- Duplicate records.
- Missing permission evidence.
- Opt-out scenarios.
- Cross-tenant access attempts.
- API failures.
- Queue retries.
- Worker recovery.
- Provider failures.

Do not claim a feature is complete if its required tests have not passed.

## 9. Git and Code Management

- Work on a feature branch when appropriate.
- Make small, meaningful commits.
- Never overwrite existing work without checking it.
- Never delete important files without approval.
- Review changes before merging.
- Do not deploy to production without explicit approval.

## 10. Agent Communication

After completing every task, report:

1. What you implemented.
2. Which files you created or modified.
3. Which commands you executed.
4. Which tests you ran.
5. Test results.
6. Known issues.
7. Remaining work.
8. Any costs or external services required.

Ask questions when requirements are unclear.

Do not invent missing business rules.

## 11. First-Time Repository Instructions

When first accessing this repository:

1. Read all project documentation.
2. Summarise your understanding of the product.
3. Explain the proposed architecture.
4. Identify missing requirements and technical risks.
5. Check the repository and development environment.
6. Prepare a phased implementation plan.
7. Wait for user approval.

Do not generate application code or install dependencies until the first implementation task is approved.
