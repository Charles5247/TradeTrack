# Agent as a system — Gate 1 draft

## One-page summary

**Proposed:** one bounded worker prepares evidence-backed proposals; application code owns permissions, arithmetic, budgets, approval, retries and writes. The model has read/propose tools only. A separate application dispatcher commits approved commands through shared manual business rules. No arbitrary SQL, shell, browser, supplier messaging or cross-organization search. Existing stock/PO mutation paths need hardening before this parity promise is met. Limits below are assumptions for measurement, not approved plan allowances. This is a light design contract; deployment architecture and build prompts wait until Gate 2 approval.

Authority: [spec §§3/6–12 and D1–D8](../track-kasuwa-ai-assistant-spec.md). Tool names below are **proposed logical contracts, not existing endpoints**. Schemas/entities are defined in [erd-delta.md](erd-delta.md); test IDs in [edge-cases.md](edge-cases.md) are planned, not executed.

## Harness and sandbox

| Part | Design | Failure mode → test |
|---|---|---|
| Control loop | Authenticate → reserve allowance → parse → retrieve → propose → validate → checkpoint → review. Deterministic services calculate quantities, totals and metrics. Only missing/failed rows need another attempt. | Hallucinated or truncated rows → compare source row count, totals and labelled fields (E07/E08). |
| Bounds | **Assumption:** 8 model/tool steps, 2 retries per transient operation within those steps; 60 seconds per call, 180 seconds active job deadline; maximum provider+tool spend **US$0.50/job**. Persist counters across restart. At any ceiling stop calls, preserve draft and explain next action. | Loop/spend overrun → fake clock/provider verifies no ninth step, third retry or call without worst-case reservation (E11/E42). |
| Allowances | Reserve worst-case job cost atomically against organization monthly allowance before any paid work; settle actual measured cost, release unused reserve. Include parsing/search/retries. No known price means no paid call. Rate/FX snapshot if allowance displayed in ₦. | Concurrent jobs/unknown bill → ledger never overspends or releases uncertain charges (E42). D5 numbers remain Q03. |
| Resume | Durable stage, input hash, tool result, lease, versions and budget. Lease prevents concurrent advancement. Reconcile unknown writes by command key; an uncertain provider call retains its charge reservation before any budgeted retry. | Crash at any checkpoint → one business effect; no unmetered retry (E28/E29/E36). |
| Approval | Seal reviewed revision; Owner confirms selected effects and explicit price changes. Fix/edit/conflict invalidates affected approval. No model override or competing agents. | Hash/role/version drift → reject without writes (E24/E26/E30/E37). |
| Prompts/evals | Version prompt, model, schema, glossary and metric definitions; freeze fixtures per release. Run deterministic contract tests plus merchant-labelled English/Hausa extraction, injection/refusal and evidence checks. | Regression → compare field accuracy, edits, reconciliation precision, refusal, citation coverage, latency and cost; independent labels required (E40/E47). No accuracy threshold invented; Q09. |
| Isolation | Parse untrusted files in disposable CPU/memory/time/file-size-limited sandbox; no macros/formulas, shell or arbitrary code tool. Any required execution uses that sandbox, without credentials or network. | Archive bomb/macro/exfiltration → terminate safely, zero external requests (E02/E03/E40). |
| Access | Worker gets job-scoped org and read-only analysis views/tools, never DB write credentials. Only staging service persists proposals. No direct agent network except brokered public price search. Trusted harness separately calls configured model provider; parser/model cannot choose destinations. | Forged org/URL/tool → deny; capture provider/search payloads (E38–E40). Approved commit dispatcher is outside analysis sandbox. |

## Typed tool catalogue

Common envelope: server-derived org/actor/job/revision, bounded input, schema-checked output. **Read permission R:** current Owner entitlement/switch; job-scoped worker delegation. **Propose P:** R plus writable current revision. **Commit C:** current Owner, approved hash/selection, live entitlement/switch, same-org references and versions. Errors are typed: denied, invalid, missing, conflict, unavailable, budget, unknown-outcome. No raw provider/SQL diagnostics shown. Idempotency rules are per row below; read calls return an evidence timestamp, not a write guarantee.

| Class / tool | Typed inputs → outputs | Errors; permission; idempotency |
|---|---|---|
| Read: source | source ID, bounded page/cell range → text, spans, warnings | invalid/missing; R; source hash + parser version |
| Read: catalog | barcode/SKU/alias or product IDs → candidates, units, versions | missing/ambiguous; R; same query + snapshot |
| Read: stock/PO/history | IDs, warehouse, period → quantities, outstanding, costs, versions | denied/missing; R; snapshot, recheck on commit |
| Read: metrics | metric enum, Nigeria period, filters → values, coverage, record citations | invalid/insufficient-data; R; definition + snapshot key; no SQL input |
| Read: knowledge | glossary version, product context → glossary/approved memory items | missing/expired; R; versioned keys |
| Read: price search | sanitized generic product, pack, NGN → comparables, URLs, dates | unavailable/no-comparable/budget; R; org/query/freshness key |
| Propose: rows/action | extracted facts, target IDs, unit/cost/price decisions → validated staging revision | invalid/conflict; P; input hash + request key; no business writes |
| Propose: answer | question/context IDs, metric evidence → answer, citations, limitations | unsupported/off-topic; P; request key; read-only answer needs no approval |
| Propose: repair/memory | failed row/correction, evidence → linked fix or suggested learned item | stale/invalid; P; source revision + key; Owner accepts memory separately |
| Commit: intake row | approved job/row/hash/key → confirmed result + audit ID | conflict/invalid/unknown; C; durable same-key/same-payload receipt, changed payload rejected |
| Commit: receipt | approved receipt group/hash/key → all line results + audit | conflict/rollback/unknown; C + PO entitlement; one key/group; **atomic assumption Q04** |
| Commit: draft action | approved transfer/PO/restock command → draft ID + audit | invalid/unavailable; C + domain feature; stable key; no sending/receiving implicitly |

Commit tools are **not exposed to the model**. The application dispatches them only after approval. Existing [import RPC](../../../supabase/migrations/015_business_imports.sql) supports new-product opening stock and catalog updates, not existing-product intake. [Adjustment](../../../src/lib/inventory/adjust-stock.ts) and [PO receipt](../../../src/components/purchase-orders/purchase-orders-screen.tsx) are separate non-atomic paths. Therefore commit tools are unavailable until equivalent manual/AI transactions enforce domain validation, locks, idempotency and audit together. Reuse rules, not unsafe partial writes. AI-3 actions wait for their corresponding domain boundary; a restock-list table/API is not asserted to exist.

## Memory, knowledge and guardrails

**Memory proposal:** store approved unit conventions/conversion ratios, product aliases, supplier-ID mappings and structured corrections, with origin/version/expiry in `ai_memory_items`. **Assumption:** expire after 180 inactive days; raw uploads after 30 days; unapproved drafts after 90 days. Owner can list, edit, delete and reset learned items; delete cached copies and stop retrieval immediately. Edits create a version and invalidate dependent approvals. Audit retains only IDs/action/hash, not deleted values. Never store credentials, payment details, customer contacts, staff judgments, raw invoice images or unapproved guesses as learned memory. Contradictory conventions ask again (E10/E41). Retention/backup/audit periods require Q07.

**Grounding proposal:** merchant records for business facts; versioned Nigerian units/product glossary for vocabulary only; approved per-org memory for conventions; public price evidence only for price suggestions. Cite each numeric claim/field to record IDs+period, page/cell/span, glossary version or URL+date+pack conversion. No market source means “No reliable market price found”; history/margin fallback is labelled a suggestion. [Current analysis](../../../src/lib/ai/analysis.ts) lacks fair hours and sufficient supplier evidence; never infer them (E43–E46).

**Guardrails proposal:** treat files, fetched text and memory as data, never instructions; allowlisted operations and schema/semantic validators enforce this beyond prompts. Refuse off-topic and cross-merchant requests before retrieval. External search strips merchant identity and forbids private-network/arbitrary URL fetching. Trace job/revision, prompt/model/tool versions, stage timing, tokens, estimated/actual cost, edits, failures and approval/commit outcomes; redact content. Owner sees own traces; platform telemetry/sharing follows D8 consent, not default analytics access. Minimal operational metering versus shared product-improvement data needs Q08.

**Verified baseline:** [provider](../../../src/lib/ai/openai.ts) has structured output, an untrusted-data instruction, 60-second abort and output caps; [API](../../../src/app/api/ai/route.ts) reserves jobs but does not persist provider usage. [016](../../../supabase/migrations/016_ai_assistant_plumbing.sql) limits jobs per user/hour and audits full outputs; that is not a monetary ceiling or deletable-memory policy. Existing [provider tests](../../../src/lib/ai/__tests__/openai.test.ts) are extension points, not evidence that this design passes.
