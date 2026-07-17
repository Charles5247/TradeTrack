# Data Models

> This document defines every collection (NoSQL) or table (SQL) in the application. Every field is specified with its type, default value, and constraints. These exact names are used throughout all architecture docs and build prompts.

---

## Naming Conventions

- Collection/table names: `camelCase` (e.g., `bankStatements`, `transactionNotes`)
- Field names: `camelCase` (e.g., `userId`, `createdAt`, `isBusinessExpense`)
- Enum values: `snake_case` (e.g., `pending`, `in_progress`, `completed`)
- Boolean fields: prefix with `is`, `has`, or `can` (e.g., `isActive`, `hasReceipt`)

---

## Collection: [collectionName]

**Purpose:** [One sentence describing what this collection stores]

**Relationships:** [How this relates to other collections — e.g., "Each document belongs to a user via userId"]

### Fields

| Field         | Type                                                  | Required | Default                | Immutable | Description                              |
| ------------- | ----------------------------------------------------- | -------- | ---------------------- | --------- | ---------------------------------------- |
| `id`          | string                                                | yes      | auto-generated         | yes       | Unique document identifier               |
| `userId`      | string                                                | yes      | —                      | yes       | Owner of this document, matches auth UID |
| `[fieldName]` | [string / number / boolean / timestamp / array / map] | [yes/no] | [default value or "—"] | [yes/no]  | [What this field stores]                 |
| `createdAt`   | timestamp                                             | yes      | server timestamp       | yes       | When the document was created            |
| `updatedAt`   | timestamp                                             | yes      | server timestamp       | no        | When the document was last modified      |
| `isDeleted`   | boolean                                               | no       | false                  | no        | Soft delete flag — never hard-delete     |

### Indexes

| Index Fields           | Direction | Purpose                                                             |
| ---------------------- | --------- | ------------------------------------------------------------------- |
| `userId` + `createdAt` | DESC      | [What query this supports — e.g., "List user's items newest first"] |
| `userId` + `status`    | ASC       | [What query this supports]                                          |

### Security Rules

| Operation | Rule                 | Description                               |
| --------- | -------------------- | ----------------------------------------- |
| Create    | `auth != null`       | Only authenticated users can create       |
| Read      | `userId == auth.uid` | Users can only read their own documents   |
| Update    | `userId == auth.uid` | Users can only update their own documents |
| Delete    | Denied               | Soft delete only — set `isDeleted = true` |

### Validation Rules

- `[fieldName]` must be [constraint — e.g., "between 1 and 100 characters"]
- `[fieldName]` must match pattern [regex or rule]
- `[fieldName]` must be one of: [`value1`, `value2`, `value3`]

---

## Collection: [nextCollectionName]

[Repeat the same structure for each collection...]

---

## Cross-Collection Relationships

```
[collectionA].fieldX ──references──→ [collectionB].id
[collectionA].fieldY ──references──→ [collectionC].id
```

[Describe relationships in plain English]

---

## Notes

- All timestamps use server timestamps, never client-generated
- All monetary values are stored as integers in the smallest currency unit (cents, kobo, etc.) to avoid floating-point issues
- Soft deletes are used everywhere for audit trail preservation
- `userId` is always set to the authenticated user's UID and is immutable after creation
