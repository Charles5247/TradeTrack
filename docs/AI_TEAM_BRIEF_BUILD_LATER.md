# Future candidates outside the AI stock-intake programme

**Updated 26 October 2026.** These are optional candidates outside the current programme, not release commitments. Candidate IDs below are historical references, not the active AI-1–AI-5 milestone IDs; examples are fictional. See the [roadmap](AI_FEATURE_ROADMAP.md).

The active programme is AI-assisted normal and bulk stock intake from printed photos, digital/scanned PDFs, handwriting, complete selected CSV/XLSX sheets, pasted text and recorded English stock dictation/corrections. All these modalities remain required within AI-1 through AI-5. AI is available beside familiar product/stock entry; manual entry stays available. The merchant resolves unclear details, reviews and approves selected ready receipts once. Real examples and an independent reviewer are not available yet; controlled synthetic checks do not establish real-world quality. Retail BI and business insights are separate future work. Read the [active plan](AI_STOCK_INTAKE_PLAN.md), [brief](AI_TEAM_BRIEF_BUILD_FIRST.md), [specification](STOCK_INTAKE_AND_RETAIL_BI_SPEC.md) and [handoff](AI_AND_BI_IMPLEMENTATION_HANDOFF.md).

## Consider after evaluating the current programme

Follow [AI-1 through AI-5](AI_AND_BI_MILESTONES.md) for current work. Complete each feature through AI preparation, review, authorized saving, outcomes and recovery before the next. Historical M0/M1/M2 code/evidence is reusable foundation, not a completed new AI feature. The broader barcode/inventory architecture is reference, not an instruction to implement every idea.

| Feature | Simple example | Required foundation |
| --- | --- | --- |
| AI-02: Business questions | “Which products sold most this week?” | Explain shared BI definitions using authorized records, period and coverage; extend the existing assistant. |
| AI-03: Guided actions | “Prepare a transfer of 20 bags to Warehouse B.” | Fill a draft backed by a reliable save command; a person reviews and confirms. |
| AI-04: Conversational voice POS/search | “Find this product and prepare a cart.” | A separate voice/cart workflow and language tests. Recorded stock dictation and corrections already belong to the active intake programme. |
| AI-05: Delivery-to-PO matching | “I ordered 20 boxes but received 18.” | Compare the reviewed receipt to a selected PO; partial receiving needs supporting work. A person confirms damage. |
| AI-06: Explain cost changes | “What price maintains my chosen margin?” | Reliable receipt/catalog costs and owner policy; proposed price needs approval. |
| AI-07: Restocking review | “Which items should I check before ordering?” | Dependable stock/history; start with configured thresholds and explain missing lead times. |
| AI-08: Owner summary | “Summarize today's sales and stock issues.” | On-demand narrative from shared BI. Scheduling and external channels need separate delivery support/preferences. |
| AI-09: Supplier-message drafts | “Ask my supplier for 50 bags.” | Reviewed recipient/order details, integration and explicit approval before sending. Supplier messaging is outside the current programme. |

## Consider only when evidence and value justify it

| Feature | Simple example | Why conditional |
| --- | --- | --- |
| AI-10: Demand forecasting | Suggest next month's order quantity. | Needs reliable history, stockouts, lead times and evidence against a simple baseline. |
| AI-11: Cross-selling/slow-stock bundles | Suggest a brush with paint. | Needs basket history, verified costs/stock and owner discount rules. |
| AI-12: Shelf-photo counting | Estimate visible boxes for a stock count. | Needs reviewed count sessions and tested images. Hidden goods cannot be counted; estimates never adjust stock automatically. |
| AI-13: Unusual-activity review | Flag repeated reversals. | Needs complete events and measured false alarms; a flag is not proof of theft. |
| AI-14: Customer/debt assistance | Explain overdue balances or draft a reminder. | Needs customer identity, complete credit/payment history and preferences. Predictive credit decisions need a separate policy. |
| AI-15: Additional legacy migration formats | Read a Word table or exported legacy data. | Beyond current supported intake; test each format/review path separately. No accounting-system connection is implied. |
| AI-16: Payment-reference assistance | Extract a reference and find its status. | Needs trusted bank/provider records. Screenshots/SMS cannot prove funds arrived. |

## Separate barcode and inventory expansion candidates

These remain outside AI-1 through AI-5; they are not silently added because the reference document describes them. Give any selected feature its own complete workflow and acceptance plan before scheduling it.

| Candidate | Existing boundary and full feature to define |
| --- | --- |
| Global hardware-scanner POS support | Typed lookup exists; add focused scanner interception, catalog resolution, safe cart updates and tested supported devices. |
| Rapid scan-to-stock | Photo lookup does not receive stock; add a reviewed counting/intake path using the shared receipt command, with duplicate/pack controls and final outcomes. |
| Continuous camera scanning | Still-photo native detection exists; streaming, decoder fallback, lens controls and Android permission handling need separate implementation/device evaluation. |
| Fractional inventory/sales balances | Fractional purchase quantities with exact whole-base-unit conversion are included now. Fractional final inventory/sales balances require a separate compatibility programme across POS, ledger, sync and reporting. |
| Serial/IMEI tracking | Requires per-unit identity, receiving, sale selection, returns and receipt traceability; no implemented serial table/workflow was found. |
| Supplier-channel ingestion / broader migration studio | Manual supported-source upload is included now. WhatsApp/email connections and additional legacy formats need their own tenant authorization, lifecycle and evaluation. |

## Rules for future decisions

Use only authorized merchant records and dependable shared calculations. Explain uncertainty; never invent costs, identities, stock or payment confirmation. Review changes to stock, money, prices and outbound messages through deterministic authorized operations. Keep normal entry available; hosted AI needs connectivity.

Forecasting, supplier messaging, shelf counting, autonomous price changes, conversational voice POS and general accounting remain outside the current programme. Review future ordering after the controlled AI prototype and subsequent merchant validation, using measured merchant benefit. This future-candidate brief authorizes no additional feature implementation or external messaging.
