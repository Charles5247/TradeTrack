# API Endpoints

> Every API endpoint specified to the field level — request body, response, errors, auth, rate limits, and edge cases. These exact paths are referenced in page specs and build prompts.

---

## Naming Conventions

- Endpoints use kebab-case: `/api/bank-statements`
- Resource names are plural: `/api/transactions`
- Nested resources: `/api/transactions/:transactionId/notes`
- Non-CRUD actions use POST: `POST /api/transactions/bulk-classify`

## Standard Response Format

### Success (200/201)

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

### Paginated Success

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "hasMore": true
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": { "field": "email", "issue": "Invalid email format" }
  }
}
```

## Standard Error Codes

| HTTP Status | Code               | When Used                                          |
| ----------- | ------------------ | -------------------------------------------------- |
| 400         | `VALIDATION_ERROR` | Invalid input, missing required fields             |
| 401         | `UNAUTHORIZED`     | No auth token or expired token                     |
| 403         | `FORBIDDEN`        | Valid token but wrong role or not owner            |
| 404         | `NOT_FOUND`        | Resource does not exist                            |
| 409         | `CONFLICT`         | Duplicate resource                                 |
| 429         | `RATE_LIMITED`     | Too many requests                                  |
| 500         | `INTERNAL_ERROR`   | Server error (log details, return generic message) |

---

## Feature: [Feature Name]

### [METHOD] /api/[path]

**Description:** [What this endpoint does in one sentence]

**Auth:** Required | Optional | None
**Role:** user | admin | any
**Rate Limit:** [X] requests per [Y] minutes per user

#### Request

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**URL Parameters:**

| Param     | Type   | Required | Description   |
| --------- | ------ | -------- | ------------- |
| `[param]` | string | yes      | [description] |

**Query Parameters:**

| Param   | Type   | Required | Default | Description              |
| ------- | ------ | -------- | ------- | ------------------------ |
| `page`  | number | no       | 1       | Page number              |
| `limit` | number | no       | 20      | Items per page (max 100) |

**Request Body:**

| Field     | Type   | Required | Validation | Description   |
| --------- | ------ | -------- | ---------- | ------------- |
| `[field]` | [type] | [yes/no] | [rules]    | [description] |

#### Response

**Success (200/201):**

```json
{
  "success": true,
  "data": {
    "[field]": "[type — description]"
  }
}
```

**Errors:**

| Status | Code               | When                 |
| ------ | ------------------ | -------------------- |
| 400    | `VALIDATION_ERROR` | [Specific condition] |
| 401    | `UNAUTHORIZED`     | No token or expired  |
| 404    | `NOT_FOUND`        | [Specific condition] |

#### Edge Cases

- [What happens if X]
- [What happens if Y]

#### Processing Steps

1. Validate auth token (401 if invalid)
2. Extract userId from token
3. Validate request body (400 if invalid)
4. [Business logic in plain English]
5. Return response

---

### [METHOD] /api/[next-path]

[Repeat the same structure for each endpoint...]

---

## Endpoint Summary Table

| Method | Path                 | Auth | Rate Limit | Description       |
| ------ | -------------------- | ---- | ---------- | ----------------- |
| POST   | `/api/auth/login`    | No   | 10/min     | User login        |
| POST   | `/api/auth/register` | No   | 5/min      | Registration      |
| GET    | `/api/transactions`  | Yes  | 100/min    | List transactions |
