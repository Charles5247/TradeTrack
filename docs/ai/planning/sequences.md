# Core sequences — Gate 1 draft

## One-page summary

All diagrams describe **proposed behavior** unless explicitly labelled existing. The Owner alone approves. Generation requires connectivity and reserved allowance; approval can wait offline, but business success requires server confirmation. Direct intake keeps good rows when others fail (D3); fixes require fresh approval (**assumption**). PO receipt is gated on a safe manual receipt foundation and atomicity confirmation. D4 cannot be implemented by treating the current generic sync success as proof of an applied approval. Diagrams deliberately name logical components rather than inventing endpoints.

Authority: [spec D1–D6 and §6](../track-kasuwa-ai-assistant-spec.md). State names follow [proposal-lifecycle.md](proposal-lifecycle.md). Future contracts follow [agent-design.md](agent-design.md).

## (a) Stock In upload

```mermaid
sequenceDiagram
    actor O as Owner
    participant UI as Stock In / Bulk Add
    participant Q as Local upload queue
    participant H as Application harness
    participant W as Isolated parser / AI worker
    participant P as Proposal staging
    participant C as Approved commit dispatcher
    participant DB as Business records + audit
    O->>UI: Upload or paste
    UI->>Q: Persist source intent and fingerprint
    Note over Q,H: Offline: show queued, no generation or stock mutation
    Q->>H: On connection, submit same intent key
    H->>H: Check Owner, org, plan, switch, duplicate, allowance
    H->>W: Bounded extraction and org-scoped matching
    W-->>H: Rows, evidence, uncertainty, optional price sources
    H->>P: Validate totals/units, checkpoint revision
    P-->>UI: Reading → matching → draft ready
    O->>UI: Resolve questions, edit/skip/select rows and price choices
    UI->>P: Seal reviewed revision and approval hash
    O->>UI: Apply exact stated effects
    UI->>C: Approved revision, selected commands, stable keys
    C->>DB: Recheck versions/authority, atomic transaction per row
    DB-->>C: Confirmed outcomes and audit IDs
    C-->>UI: Applied / partially applied / confirmation pending
```

D6: missing cost becomes ₦0 **with** `cost_needs_update`, reminder and profit exclusion, not a guessed fact. No selected selling-price change means current price stays. Generation persists drafts, not business mutations. Current [assistant](../../../src/app/(dashboard)/assistant/page.tsx) uses in-memory draft state and immediate `/api/ai` approval; the durable queue/review contract is new. Proof: E01–E19/E24–E29.

## (b) Invoice versus PO reconciliation

```mermaid
sequenceDiagram
    actor O as Owner
    participant H as Harness
    participant R as Read tools / deterministic reconciliation
    participant P as Proposal staging
    participant C as Approved receipt dispatcher
    participant DB as PO / inventory / audit
    O->>H: Select open PO and invoice
    H->>H: Verify AI + Business PO access and reserve usage
    H->>R: Extract facts, read same-org PO and expected versions
    R-->>P: Quantity, unit, price, total and unordered-item differences
    P-->>O: PO 431300, invoice 473600, difference 42300 NGN
    O->>P: Receive 20 Indomie, 4 Peak, 12 Power Oil, hold Kings
    Note over O,P: Explicit invoice costs and price choices, Peak outstanding remains 1
    O->>C: Approve exact receipt group
    C->>DB: Lock PO/stock, verify outstanding and approved group
    alt Every approved line valid
        DB-->>C: Commit all receipt lines + audit, PO partly outstanding
        C-->>O: Confirm receipt and held item, no supplier payment
    else Conflict or any receipt write failure
        DB-->>C: Roll back entire approved receipt group
        C-->>O: Re-review conflict or approve proposed fix
    end
```

**Assumption Q04:** receipt group is atomic, not “entire PO must arrive.” Current [receipt loop](../../../src/components/purchase-orders/purchase-orders-screen.tsx) instead adds all ordered quantities and ignores intermediate write errors. [011 schema](../../../supabase/migrations/011_purchase_orders.sql) has item received quantities but no partial parent status. Do not attach reconciliation until foundation exists. Proof: E20–E23.

## (c) Offline approval, reconnect and the real conflict rule

**Verified existing rule:** [sync engine](../../../src/lib/offline/sync-engine.ts), `executeSyncOperation`: generic UPDATE reads `updated_at`; strictly newer server time drops the local write and returns success. Equal timestamps proceed. It is read-then-write, not atomic compare-and-set. Import commands instead use `apply_import_row`; vendor `stock_sync` instead uses exact server-version matching and keeps conflicts/unknown outcomes for review. None currently implements durable AI approval.

```mermaid
sequenceDiagram
    actor O as Owner offline
    participant L as Local proposal + intent outbox
    participant S as Existing sync infrastructure
    participant A as Proposed AI approval handler
    participant DB as Server records
    O->>L: Apply +12 against cached stock 20, store versions/hash/key
    L-->>O: Approval pending connection, stock not confirmed
    Note over S,DB: Existing generic route would queue absolute 32
    Note over S,DB: Server stock 18 with newer time → drop 32 as synced
    Note over S,DB: Equal time → generic write proceeds, not D4 re-review
    L->>S: Reconnect, route approval intent as command, not generic UPDATE
    S->>A: Same intent key after authentication
    A->>DB: Check result by key, current Owner/org/plan/switch and facts
    alt Command already committed
        DB-->>O: Original confirmed result, no extra +12
    else Any stock / cost / selling price / unit / target / PO outstanding changed
        DB-->>A: Conflict, zero effects
        A-->>O: reviewing: show changes and ask again
        O->>A: Approve new revision if desired
    else Facts unchanged
        A->>DB: Locked atomic +12, command receipt and audit
        DB-->>O: applied: stock 32 confirmed
    end
```

**Proposed D4 adaptation:** use command-specific checks, consistent with the existing vendor review pattern, and compare all approved business facts, even if timestamps tie. Preserve current generic behavior for other flows; never silently drop an AI approval or overwrite from its cached snapshot. Existing [PO lifecycle guard](../../../src/lib/offline/purchase-orders.ts) remains online-only until explicitly extended. Proof: E30–E36.

## (d) Allowance exhausted

```mermaid
sequenceDiagram
    actor O as Owner
    participant H as Harness
    participant U as Proposed usage ledger
    participant W as AI worker
    O->>H: Generate proposal
    H->>U: Atomically reserve worst-case cost for org/month/job key
    alt Monthly balance insufficient or job ceiling reached
        U-->>H: Deny reservation
        H-->>O: Allowance used, reset date, keep upload, manual entry available
        Note over H,W: No provider call, search or automatic paid retry
    else Reservation accepted
        U-->>H: Reservation and remaining amount
        H->>W: Work within reserved ceiling
        W-->>H: Result or bounded failure plus usage
        H->>U: Settle actual, release only proven unused reserve
        H-->>O: Draft or readable failure
    end
```

**Assumption Q03:** hard stop, no overage purchase; viewing and committing existing approved drafts stays available within normal entitlement. Current [016 rate limit](../../../supabase/migrations/016_ai_assistant_plumbing.sql) is per-user count, not D5 allowance. Proof: E42.

## (e) Partial failure and proposed fixes

```mermaid
sequenceDiagram
    actor O as Owner
    participant C as Commit dispatcher
    participant DB as Business records / command receipts / audit
    participant W as Worker
    participant P as Proposal staging
    O->>C: Apply approved direct-intake rows A, B, C
    C->>DB: Atomic row A
    DB-->>C: A applied
    C->>DB: Atomic row B
    DB-->>C: B rolled back, validation reason
    C->>DB: Atomic row C
    DB-->>C: C applied
    C-->>O: partially_applied: A/C saved, B failed, audit links
    O->>W: Request fix for B or choose customer care
    W->>P: Proposed B revision with diff and evidence
    P-->>O: Explain fix, no write yet
    O->>C: Approve repaired B under new key linked to old failure
    C->>DB: Revalidate and commit B once
    DB-->>O: Confirm B, A/C never replay
```

Fresh approval of fixes is an explicit **D3 assumption**. Customer-care context is previewed/redacted and sent only after Owner choice and a separately approved support-sharing policy; no automatic analytics access (D8). [015](../../../supabase/migrations/015_business_imports.sql) already keeps row results, including errors, immutable; reusing a failed import key returns its old error. Proof: E27–E29/E39.

**Navigation proposal:** back/reload restores the current persisted revision; it never undoes a commit. Unknown writes display confirmation pending until queried. No optimistic financial/stock success screens. These sequences have not been run against a provider, database or native app.
