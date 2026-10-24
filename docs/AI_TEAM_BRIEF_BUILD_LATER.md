# AI candidates after bulk intake and Retail BI

**Planning handoff · updated 19 October 2026.** These are optional candidates outside the current programme, not release commitments. IDs match the [roadmap](AI_FEATURE_ROADMAP.md); examples are fictional.

The current programme includes **bulk intake from printed photos, digital/scanned PDFs, handwriting, selected CSV/XLSX sheets, pasted text and stock dictation**, followed by **Retail BI**. The merchant resolves exceptions, reviews the summary and approves selected ready receipts once; every prepared row is inspectable. Handwriting and language-specific voice enablement depend on evaluation within this programme, not an unspecified later roadmap. See the [brief](AI_TEAM_BRIEF_BUILD_FIRST.md), [specification](STOCK_INTAKE_AND_RETAIL_BI_SPEC.md) and [handoff](AI_AND_BI_IMPLEMENTATION_HANDOFF.md).

## Consider after evaluating the current programme

The current programme follows [sequential milestones M0–M11](AI_AND_BI_MILESTONES.md). Complete each feature through UI, authorized saving/reporting, recovery and acceptance before starting the next. Existing photo-code lookup, imports and text AI are reusable foundations, not new milestones already completed. The broader barcode/inventory architecture document is a proposal from a different checkout, not a release report.

| Feature | Simple example | Required foundation |
| --- | --- | --- |
| AI-02: Business questions | “Which products sold most this week?” | Explain shared BI definitions using authorized records, period and coverage; extend the existing assistant. |
| AI-03: Guided actions | “Prepare a transfer of 20 bags to Warehouse B.” | Fill a draft backed by a reliable save command; a person reviews and confirms. |
| AI-04: Conversational voice POS/search | “Find this product and prepare a cart.” | A separate voice/cart workflow and language tests. Recorded stock dictation and corrections already belong to AI-01. |
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

These remain outside M0–M11; they are not silently added because the reference document describes them. Give any selected feature its own complete workflow and acceptance plan before scheduling it.

| Candidate | Existing boundary and full feature to define |
| --- | --- |
| Global hardware-scanner POS support | Typed lookup exists; add focused scanner interception, catalog resolution, safe cart updates and tested supported devices. |
| Rapid scan-to-stock | Photo lookup does not receive stock; add a reviewed counting/intake path using the shared receipt command, with duplicate/pack controls and final outcomes. |
| Continuous camera scanning | Still-photo native detection exists; streaming, decoder fallback, lens controls and Android permission handling need separate implementation/device evaluation. |
| Fractional multi-UOM | Integer pack conversion is in the current programme. Fractional inventory/sales requires a deliberate compatibility migration across POS, ledger, sync and reporting. |
| Serial/IMEI tracking | Requires per-unit identity, receiving, sale selection, returns and receipt traceability; no implemented serial table/workflow was found. |
| Supplier-channel ingestion / broader migration studio | Manual supported-source upload is included now. WhatsApp/email connections and additional legacy formats need their own tenant authorization, lifecycle and evaluation. |

## Rules for future decisions

Use only authorized merchant records and dependable shared calculations. Explain uncertainty; never invent costs, identities, stock or payment confirmation. Review changes to stock, money, prices and outbound messages through deterministic authorized operations. Keep normal entry available; hosted AI needs connectivity.

Forecasting, supplier messaging, shelf counting, autonomous price changes, conversational voice POS and general accounting remain outside the current programme. Review future ordering after the intake/BI pilot, using measured merchant benefit. No application work or external messaging is authorized by this brief.
