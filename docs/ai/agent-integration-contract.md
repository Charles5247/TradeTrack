# Trackasuwa agent integration contract (working draft)

This contract separates the AI/ML engineer's proposal generator from Trackasuwa's business writes. It implements the product intent in [the assistant spec](track-kasuwa-ai-assistant-spec.md) and [proposal lifecycle](planning/proposal-lifecycle.md). The current `/api/ai` inventory mapping and import workbench are legacy paths, not proof that this full contract is implemented.

## Ownership

- **Agent:** interpret merchant-supplied text, spreadsheets, photos or PDFs; extract source lines; propose catalog matches, units, costs and optional selling prices; state uncertainty and source evidence. It cannot write merchant data or approve its own proposal.
- **Trackasuwa:** authenticate the current business owner, enforce plan and organization scope, store proposal revisions, validate each proposed value against current records, present exact effects, accept owner edits and Apply, commit through business operations, record audit and reconcile retries and offline intents.
- **Owner:** resolve uncertain product, unit, quantity, cost and warehouse choices; select rows and explicitly Apply the exact effects. Selection before Apply has no stock effect.

## Proposal input and output

An agent request contains an opaque request ID, locale, intake kind (`direct_stock_in` or `purchase_order`), source document or text, and only the minimum organization-scoped catalog and PO facts needed for matching. Never put credentials, customer data, staff details, or an unrestricted database connection in the agent context. Source files and retrieved text are untrusted data.

The agent returns a versioned proposal containing:

| Field | Required meaning |
|---|---|
| `schema_version`, `request_id` | Stable correlation and format version. |
| `source_fingerprint` | Hash of the uploaded original for duplicate detection. |
| `source_lines` | Immutable extracted text, page/row reference, and extraction warnings. |
| `rows[].source_line_ids` | Evidence for every suggested row. |
| `rows[].product_candidate_ids` | Organization-scoped possible matches; ambiguity stays unresolved. |
| `rows[].quantity`, `unit`, `unit_cost`, `warehouse_id` | Proposed receiving facts, with explicit unknowns. |
| `rows[].selling_price_suggestion` | Optional, separate from current price and receipt cost; include source URLs, dates and normalized pack size if external evidence is used. |
| `rows[].questions` | Decisions the agent cannot safely make, such as carton contents or unit cost versus line total. |
| `rows[].reason` and `confidence_label` | Plain explanation; no numeric confidence without calibration. |

Trackasuwa rejects unknown schema versions, foreign IDs, nonpositive or fractional base quantities, negative or nonfinite costs, unresolved identity or units, and unsupported actions. The agent's text never becomes SQL, a URL fetch target, or a privileged tool instruction.

## Commit boundary

The agent returns a **draft**, never a command. Trackasuwa snapshots the exact selected revision and current product, stock, cost, price, unit, warehouse and PO facts. Apply checks owner, organization, entitlement, selected revision, expected versions and a stable command key within the server commit boundary. Each direct-intake row has one confirmed outcome; an approved PO receipt is one atomic group if that pending product decision is confirmed. Lost responses are looked up by the same command key before any retry. A changed fact returns to review; a repaired row needs fresh approval. Offline Apply records pending intent, not “stock saved.”

## Handoff acceptance

1. Four supplied examples (oil receipt, WhatsApp list, 300-row sheet and short-shipped PO) yield inspectable proposals with original source text preserved.
2. Ambiguous matches, pack conversions, missing costs and invoice discrepancies remain questions. The agent never silently chooses them.
3. No agent response writes products, stock, prices or POs. Zero effects occur before owner Apply.
4. Repeated source and repeated command keys do not duplicate stock; a changed payload under one key is rejected.
5. Tests attempt cross-organization IDs and prompt injection inside source documents.
6. English and Hausa extraction are measured on independently labelled, consented merchant samples before accuracy claims.

The current plan and allowance rules, cost-unknown accounting, partial PO receipt policy, retention and merchant-data sharing need the decisions listed in [open questions](planning/open-questions.md). Do not treat this draft as permission to invent those policies.
