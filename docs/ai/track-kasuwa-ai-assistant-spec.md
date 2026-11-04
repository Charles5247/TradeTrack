# Track Kasuwa AI Assistant: Product Description (v0.3 draft)

**Purpose of this document:** describe *what* to build and *how it should feel*, with concrete examples. It deliberately says nothing about implementation. The next step is for Codex to map the existing codebase against this document (Section 15) and produce a gap analysis and implementation plan.

**Status:** v0.3. Updated after Codex's codebase map and the boss's Batch 0 answers. Anything marked **(Assumption)** is inference, not a confirmed requirement. Anything marked **(Confirm)** is still open. All prices and quantities in examples are illustrative only.

**Decisions made by the boss (Batch 0)**

| # | Decision |
|---|---|
| D1 | Only the Owner can use the AI assistant: upload, approve, read insights and ask analytics questions. Admins are excluded (confirmed by the boss), which removes AI access Admins have today, although they can still open the existing reports. This is an AI-specific permission, narrower than the role checks the app already has. Build it as a configurable permission so it can be delegated later without a rebuild. |
| D2 | AI is available on all plans except Starter. Invoice-vs-PO checking applies only where purchase orders exist. |
| D3 | When some rows in a batch fail, the good rows save. The AI fixes the failed rows, or the user can contact customer care. **(Confirm)** The boss said the AI should fix and upload them; this spec keeps Owner approval in the loop, because a fixed row no longer matches what the merchant gave. PO receipts stay all-or-nothing (proposed, not yet confirmed). |
| D4 | Offline approvals are rechecked and applied when back online. If stock, price or unit changed meanwhile, the Owner is asked again. |
| D5 | AI cost is paid from the monthly subscription, so each plan needs a usage allowance priced from measured cost. **(Confirm)** allowance numbers. |
| D6 | A missing cost is saved as ₦0, the merchant is asked to update it, and flagged items stay out of profit figures until updated. |
| D7 | Real merchant invoices and stock lists: the boss expects an answer within a week. |
| D8 | Track Kasuwa has no access to merchants' business analytics by default. Merchants are offered an opt-in to share AI feedback and analytics to help improve the product: off by default, revocable, with a clear list of what is shared. Recommended tiers: (1) usage and quality signals, (2) anonymized aggregates of business data, (3) raw documents only with explicit per-item consent. **(Confirm)** tiers and NDPA wording with someone qualified. |

---

## 1. What we are building

An AI assistant inside Track Kasuwa that does the work merchants currently do by hand in the system (entering stock, receiving deliveries, checking what is selling, deciding what to reorder) by **proposing the work, showing its reasoning, and saving only after a permitted person approves.**

The test for every feature: *If a merchant can do it in Track Kasuwa today, the assistant can do it for them, faster, as a proposal they approve.*

## 2. Who it is for

- **Small shop owner.** One owner, maybe one cashier, phone-first, little time. Stock lives in notebooks, WhatsApp messages and supplier invoices. Wants: "set up my shop without typing everything."
- **Larger business.** Business Owner, Admins and Cashiers across several warehouses, using purchase orders and transfers. Wants: control, a consistent catalog, and a record of who approved what.
- **Roles that already exist:** Platform Owner (Track Kasuwa staff), Business Owner, Admin, Cashier. The assistant inherits the signed-in user's role; it never has more power than that person.

Same assistant and same rules for everyone. What differs is permissions, plan tier and scale.

## 3. Principles (non-negotiable)

1. **Parity with the existing system.** Every assistant action goes through the same business rules, permissions and audit trail as a human action. No back doors.
2. **Propose, review, commit.** The assistant creates a *proposal* (a draft). Nothing changes stock, prices or products until a permitted person approves. Answering questions needs no approval; changing data always does.
3. **Grounded.** Insights and answers come only from the merchant's own records. The one exception is price suggestions, which use the web and always show their sources.
4. **Shows its work.** Every suggested value shows where it came from and how sure the assistant is. When it does not know, it says so instead of guessing.
5. **Strict tenant isolation.** Each merchant is its own organization. The assistant reads and writes only inside the current organization, never mixes data across merchants, and web searches never contain merchant-identifying data.
6. **A shop assistant, not a chatbot.** It knows the merchant's catalog, units (piece, pack, carton), currency (₦), suppliers and warehouses. It lives inside the screens merchants already use (Stock In, adjustments, purchase-order receiving), not only in a chat box. It declines off-topic requests.
7. **Resumable and safe to repeat.** Reload the page, lose connection, or upload the same invoice twice: nothing is lost or duplicated.
8. **Honest about connectivity.** Generating a proposal needs internet because the AI runs in the cloud, and the app says so plainly. Everything around it (queueing the upload, showing a ready draft, approving) follows the app's offline-first behaviour.
9. **Premium feel.** Visible progress, no dead ends, one clear primary action per screen, works in dark and light mode, and the same experience in the PWA, Windows app and Android app.
10. **Light and cheap.** Built for weak connections. AI cost is paid from the subscription (D5), so usage must be metered per organization.

## 4. What already exists, and where the assistant plugs in

| Existing feature (from README) | How the assistant uses it |
|---|---|
| Multi-role access (Platform Owner, Business Owner, Admin, Cashier) | Inherits the user's role; approval rights follow existing rules |
| Org-isolated merchant onboarding | Every read and write scoped to one organization |
| POS: barcode scanning, cart, discounts, tax, receipts, split/partial payments (stored as a label only today) | Source data for AI-2, AI-4, AI-5; barcodes improve product matching in AI-1 |
| Inventory: multi-warehouse, stock levels, adjustments, movement history | AI-1 writes through existing adjustments; movement history feeds AI-3 |
| Warehouse transfers and vendor consignment tracking (consignment is outward-only today) | AI-3 suggests transfers before reorders; inward consignment receipts are out of scope until defined |
| Purchase orders: create, send, receive, updates inventory on receipt (Business plan and above) | AI-1 reconciles invoices to POs; AI-3 drafts POs |
| Immutable audit trail | Every approved AI change recorded as AI-proposed, human-approved |
| Reports: daily to yearly, PDF/Excel/CSV export | AI-2 builds on these, with no second source of truth |
| Zainpay subscription billing | Out of scope; plan tiers may decide which AI capabilities a merchant gets |
| Offline-first (IndexedDB + service worker, documented conflict-resolution rule) | Approvals use the same queue and rule; generation needs connectivity |
| English and Hausa (fully translated); Yoruba, Igbo, Pidgin (scaffolded) | Assistant replies in the user's app language |
| PWA plus Windows .exe and Android .apk | Camera capture on phones, file drag-and-drop on desktop |

## 5. Capability map

| ID | Capability | Stage |
|----|-----------|-------|
| AI-1 | Smart Intake: agentic bulk inventory + invoice price suggestions | Build first |
| AI-2 | Business insights | Preview, then expand |
| AI-3 | Stock analysis and prediction | Next |
| AI-4 | Follow-up business analytics | Next |
| AI-5 | Staff performance | Next |

AI-1 is first because it creates the clean catalog and stock data that AI-2 to AI-5 depend on.

---

## 6. AI-1: Smart Intake

### 6.1 What a merchant can give it
- Pasted text (a supplier price list, a WhatsApp message)
- A spreadsheet (CSV or Excel), however messy
- A photo or PDF of a supplier invoice or receipt
- A photo of a handwritten stock list
- A screenshot of a price list

Barcodes, when present, are used first to match products. Mixed English, Pidgin and Hausa product names and shorthand ("ctn", "31k") must be understood.

### 6.2 Two receiving paths
- **Direct Stock In (all plans):** a document becomes a draft of stock additions and new products.
- **Purchase-order receiving (Business plan and above):** an invoice is reconciled against the open purchase order, and the draft becomes a goods-received proposal (Example 4). Codex's map found that today's PO receiving can only receive the full ordered quantity and ignores write errors, so partial receipts need a new foundation first. Example 4 therefore ships after that foundation.

### 6.3 The merchant's experience, step by step
1. **Upload or paste** from the existing Stock In screen, the purchase-order receive screen, or Bulk Add for first-time setup. On a phone, "Take photo" opens the camera.
2. **Visible progress** in plain language: "Reading your document → Finding your products → Preparing your draft."
3. **Review screen** (6.4). The user edits, skips or approves.
4. **Apply.** One button, labelled with its exact effect: "Add stock to 9 products and create 4 new products."
5. **Result summary** with what changed and a link to the audit record.

### 6.4 The review screen
- **Summary line:** "Found 14 items: 9 match your products (add stock), 4 are new, 1 needs your decision."
- **One row per item:** product, matched catalog item, quantity, unit, cost price, current selling price, suggested selling price, receiving warehouse, status chip, confidence.
- **Status chips:** Matched · New product · Needs your decision · Possible duplicate.
- **Actions:** edit any field inline; approve a row; "Approve all confident rows"; skip a row; answer the assistant's questions inline.
- **Nothing is saved from this screen until Apply.**

### 6.5 Example 1: photo of an oil receipt (Direct Stock In)
**Input:** a photographed supplier receipt with three lines.

| Line on receipt | What the assistant drafts |
|---|---|
| Power Oil 5L ×12 @ ₦9,800 | **Matched** to existing "Power Oil 5L". Add 12 to Main Warehouse. Cost ₦9,800 (last purchase ₦9,400, up 4%). Selling price ₦11,500 unchanged, but margin drops from about 18% to 15%, so it suggests ₦11,900 (about 18% again) and lets the owner decide. |
| Kings Veg Oil 3L ×10 @ ₦6,200 | **New product.** Suggests category "Cooking oil." Suggested selling price **₦7,200**, from a market range of ₦7,000 to ₦7,600 across 3 listed sources (shown with links and dates). Confidence: medium. |
| Gino tomato paste ×1 carton (50 sachets) @ ₦9,500 | **Needs your decision.** Asks: "Track as 50 sachets or 1 carton?" and remembers the answer for this product. |

The owner fixes the third line, approves the first two, and applies. Three lines took seconds instead of a typed form.

### 6.6 Example 2: pasted WhatsApp list
**Input:**
```
indomie 5 cartons 8500
peak milk tin 2 ctn 31k
golden penny spag 10 bags
```
**Draft:**
- Expands "ctn" to carton and "31k" to ₦31,000.
- Treats ₦8,500 as the Indomie cost per carton and asks to confirm, because a bare number could be a unit price or a line total.
- Spaghetti has **no price**, so it leaves cost blank and marks the row "Needs your decision." It never invents a cost.

### 6.7 Example 3: messy 300-row spreadsheet (first-time shop setup)
**Input:** a sheet with columns "Item", "Qty left", "Price" and inconsistent naming.

**Draft:** the assistant works out what each column means and states it ("I read 'Price' as selling price"). Rows are grouped: **240 clean** (collapsed, approvable in one click), **40 new products**, **15 likely duplicates within the file**, **5 invalid rows** with reasons. A full shop is set up in minutes, and the owner only looks closely at the 60 rows that need a human.

### 6.8 Example 4: invoice against a purchase order (Business plan and above)
**Setup:** an open PO to one supplier: Indomie 20 cartons @ ₦8,300, Peak Milk 5 cartons @ ₦30,500, Power Oil 5L ×12 @ ₦9,400. PO total **₦431,300**.

**Input:** a photo of the delivery invoice: Indomie 20 @ ₦8,500, Peak Milk 4 cartons @ ₦31,000, Power Oil ×12 @ ₦9,800, plus Kings Veg Oil 3L ×10 @ ₦6,200. Invoice total **₦473,600**.

**Draft goods-received proposal:**
- **Indomie:** quantity matches. Price up ₦200 per carton (+2.4%), flagged.
- **Peak Milk:** 4 of 5 received. Receive 4 and keep the PO open for 1 (short shipment). Price up ₦500 per carton (+1.6%), flagged.
- **Power Oil:** quantity matches. Price up ₦400 (+4.3%), flagged.
- **Kings Veg Oil:** *not on the PO.* Asks: "Add to this receipt, or hold for review?"
- **Headline:** "Invoice is ₦42,300 above the PO: ₦62,000 is an item you didn't order, one carton was short-shipped, and three prices rose." The owner sees the problem before stock is updated and before the supplier is paid.

### 6.9 Price suggestion rules
- **Three prices are never mixed:** *cost price* (a fact from the document), *current selling price* (from the merchant), and *suggested selling price* (the assistant's proposal).
- The assistant searches the web for comparable products, **normalizes pack size to the merchant's unit**, and shows a **range, sources and dates**.
- **The merchant's own history comes first:** previous purchase prices, PO prices and the usual margin shape the suggestion before web data does.
- **Never overwrites** an existing selling price. It shows the difference and asks.
- If no reliable source exists (common for local or unbranded goods), it says "No reliable market price found" and offers a margin-based suggestion instead.
- All prices in ₦. Stale or low-confidence results are labelled as such.

### 6.10 Edge cases the experience must handle
- **Unreadable photo:** say which part is unreadable; offer retake or manual entry.
- **Same invoice uploaded twice:** detect and warn before anything is proposed again.
- **Invoice total does not equal the sum of its lines:** flag it.
- **Item matches two catalog products:** ask, do not pick silently.
- **Missing cost (D6):** save ₦0, mark the item "cost needs update," ask the merchant to fix it, and keep it out of margin and insight figures until they do.
- **Consignment goods:** consignment is outward-only today, so inward consignment receipts are out of scope until the team defines them.
- **Several warehouses:** uses the default receiving warehouse or asks.
- **Offline:** the upload is queued and processed when the connection returns. An approval made offline is rechecked on reconnect and follows the app's documented conflict-resolution rule; if stock, price or unit changed meanwhile, the Owner is asked again (D4).
- **Partial failure on apply (D3):** good rows save. Failed rows are reported with proposed fixes the Owner approves, or a "Contact customer care" action with the context attached. Receiving a PO stays all-or-nothing. **(Confirm)**
- **Permissions (D1):** only the Owner can use the assistant; Admins are excluded.
- **Language:** the assistant's messages follow the user's app language.

### 6.11 AI-1 is done when
- A 100-product shop can be set up from one spreadsheet in minutes, versus the time it takes manually today.
- No stock, price or product changes without an approval event.
- Re-uploading the same document creates no duplicates.
- Every AI-proposed change is distinguishable in the audit trail from a human-typed one, and shows who approved it.
- No data crosses organizations, in tests designed to try it.

---

## 7. AI-2: Business insights

**What:** plain-language summaries built only from the merchant's sales and stock records, on top of the existing reports (daily to yearly).

**Example (weekly):**
> *This week: ₦1.84m in sales, down 9% on last week. Three products made 41% of revenue. Five items are below minimum stock. Your slowest category was Toiletries.* Each figure is tappable and opens the records or report behind it.

**Rules:** every number is traceable; comparisons always state the period; when data is thin it says "not enough data yet" rather than speculating; discounts and tax are treated as the POS records them; summaries can be exported like any other report.

## 8. AI-3: Stock analysis and prediction

**What:** identify fast, slow and dead stock, and tell the merchant what to restock before shelves go empty.

**Examples:**
> *Peak Milk 400g sells about 9 a day, you have 38 left, and your supplier usually takes 3 days. Reorder about 60 today.* → Business plan and above: "Create draft purchase order." Other plans: "Add to restock list." Either way, the owner approves.

> *Kano warehouse has 6 Peak Milk left; Main warehouse has 140 and sells about 3 a day. Transfer 40 from Main before ordering anything.* → "Create draft transfer."

**Rules:**
- Start with **transparent logic** (sales speed × supplier lead time versus stock and minimum stock level) before any machine-learning model. The owner should be able to see why.
- Check **other warehouses first**; suggest a transfer before a purchase.
- Fast/slow/dead thresholds are configurable. **(Assumption)** defaults to be set with real merchant data.
- Seasonal effects (Ramadan, Christmas, school resumption) are used only when the merchant has enough history; otherwise it says so.
- Output is always a proposal, never an automatic order.

## 9. AI-4: Follow-up business analytics

**What:** ask questions in plain language and get answers from the merchant's records, with follow-ups that remember context.

**Example conversation:**
> **Owner:** What sold best last month?
> **Assistant:** Top five by revenue: … (table) · Based on 1,204 sales, 1–30 Sept.
> **Owner:** And compared to August?
> **Assistant:** Indomie is up 18%, Power Oil is down 7% … (table)
> **Owner:** Which of those am I about to run out of?
> **Assistant:** Two: … Want me to draft a restock list?

**Rules:** every answer states what it is based on; an ambiguous period is stated as an assumption or asked about; anything outside the merchant's data is declined plainly; answers can lead to a draft action, never to a silent change; the user's language is used for the reply, and Hausa is tested separately.

## 10. AI-5: Staff performance

**What:** show which cashiers sell the most and work most efficiently, using POS data.

**Example:**
> *Amina: 62 sales/shift, average basket ₦4,100. Yusuf: 48 sales/shift, average basket ₦5,300. Refund rate for both is under 2%.*

**Rules:**
- Compare fairly: normalize for shift length, time of day and branch before ranking anyone.
- Visible to the Owner only (D1). A Cashier never sees colleagues' numbers.
- Show trends, not just leaderboards.
- Unusual voids, refunds or discounts appear as "worth a look," never as accusations.

---

## 11. Cross-cutting requirements

- **Permissions and roles:** the assistant never exceeds the permissions of the person using it. **(Confirm)** whether the Platform Owner can see merchants' AI outputs, and under what conditions.
- **Tenant isolation:** tested explicitly. Cross-organization leakage is a release blocker.
- **Audit trail:** who uploaded, what the assistant proposed, what the human changed, who approved, when. The trail is immutable, so corrections are new entries, never edits.
- **Per-capability switches and plan gating (D2):** all plans except Starter. Codex's map found no per-capability organization switches today, so they must be added.
- **Privacy:** compliance with Nigerian data protection law (NDPA); merchant data is not used to train models; send the minimum data needed. **(Confirm)** the team's legal position.
- **Cost control (D5):** a monthly AI allowance per plan priced from measured cost, a visible "remaining" count, limits per upload, caching of repeated lookups, and cheaper models for routine work.
- **Languages:** English and Hausa at launch (the UI is fully translated in both); Yoruba, Igbo and Pidgin follow as their translations are completed. **(Assumption)** model quality in Hausa is lower than in English, so Hausa gets its own test set before it ships.
- **Platforms:** the same behaviour in the PWA, Windows app and Android app.
- **Tone:** short, plain, shop-floor language. No jargon, no lectures.

## 12. How we will know it works

| Measure | Why it matters |
|---|---|
| Time to set up a 100-product shop, assistant vs. manual | The core promise |
| Share of AI draft fields the owner edits | Draft quality |
| Share of price suggestions accepted | Price usefulness |
| Unapproved writes caused by the assistant | Must be **zero** |
| Extraction accuracy on a labelled set of real invoices, in English and Hausa (labelled by shop staff, not the developer) | Independent ground truth |
| PO reconciliation: discrepancies found vs. discrepancies a human buyer finds | Trust in Example 4 |
| Restock suggestions backtested against historical sales | Prediction quality |
| Cross-organization leakage attempts that succeed | Must be **zero** |
| Cost per upload and per merchant per month | Viability |

## 13. Out of scope for now
- Any autonomous change without approval
- Messaging customers or suppliers
- Sending purchase orders to suppliers automatically
- Subscription billing and Zainpay reconciliation
- Accounting and payroll
- Features beyond AI-1 to AI-5

## 14. Still open

1. Should PO receipts be all-or-nothing? (D3)
2. AI usage allowance per plan: the numbers, and what happens at the limit. (D5)
3. NDPA wording and tiers for the opt-in sharing. (D8)
4. Real invoices and stock lists: expected within a week. (D7)
5. How units and packs are modelled, and how the offline conflict rule treats an approved AI proposal (from Codex's map).

---

## 15. Handoff: Codex mapping task (completed; kept for reference)

```
Read track-kasuwa-ai-assistant-spec.md in full. Do NOT write feature code.

Deliver, citing file paths for every claim and marking unknowns explicitly:

1. Capability map: every existing write flow that changes stock, prices
   or products (Stock In, adjustments, transfers, consignment, PO
   create/send/receive): UI, API/RPC, validation, role checks, tenant
   (organization) isolation, audit logging, offline queue handling.
2. Check for any existing AI-related code, flags, tables or prompts. If
   present, document how it works and what it covers against spec
   sections 6 to 10.
3. How the offline conflict-resolution rule would apply to a
   human-approved AI proposal.
4. Draft/commit design: where a proposal could live, how it is approved,
   and how it appears in the immutable audit trail as AI-proposed and
   human-approved.
5. Data availability for AI-2 to AI-5: which tables/reports already
   cover sales, discounts, refunds, split payments, stock movements,
   cashier attribution and supplier lead times; what is missing.
6. i18n: how Hausa and the scaffolded languages are loaded, and how the
   assistant would follow the user's language.
7. Risks: cross-tenant leakage, permissions, duplicates, offline, cost,
   privacy.
8. A proposed batch plan, smallest safe batches first, each with
   acceptance tests drawn from spec examples 6.5 to 6.8.
9. A list of spec assumptions the code contradicts.

Stop after delivering this document and wait for review.
```
