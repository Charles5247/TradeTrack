import { beforeEach, expect, it, vi } from "vitest";
import { readBatch, writeBatch } from "./http";
import { apiContext } from "../auth/api-context";
vi.mock("@/lib/auth/api-context", () => ({ apiContext: vi.fn() }));
const id = "10000000-0000-4000-8000-000000000001";
const rpc = vi.fn(),
  signedUpload = vi.fn(),
  signedRead = vi.fn();
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost/api/stock-intake-batches/${id}/register`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const registration = {
  action: "register",
  batch_id: id,
  expected_revision: 1,
  source: { id, name: "stock.csv", bytes: 10, sha256: "a".repeat(64) },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiContext).mockResolvedValue({
    db: {
      rpc,
      storage: {
        from: () => ({
          createSignedUploadUrl: signedUpload,
          createSignedUrl: signedRead,
        }),
      },
    },
    profile: { id },
    org: id,
  } as unknown as Awaited<ReturnType<typeof apiContext>>);
  rpc.mockResolvedValue({
    data: {
      batch: { id, revision: 2 },
      source: {
        id,
        status: "uploading",
        object_key: `${id}/${id}/${id}.csv`,
        excluded: false,
      },
    },
    error: null,
  });
  signedUpload.mockResolvedValue({
    data: {
      path: "private-path",
      token: "synthetic-token",
      signedUrl: "http://localhost/private-upload",
    },
    error: null,
  });
});
it("rejects foreign origins and media types before looking up credentials", async () => {
  expect(
    (
      await writeBatch(
        request(registration, { origin: "https://foreign.invalid" }),
        id,
        "register",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await writeBatch(
        request(registration, { "content-type": "application/json-malformed" }),
        id,
        "register",
      )
    ).status,
  ).toBe(415);
  expect(apiContext).not.toHaveBeenCalled();
});
it("creates a scoped immutable upload session after the authorized registration commits", async () => {
  const response = await writeBatch(request(registration), id, "register");
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("stock_intake_batch_command", {
    command: registration,
  });
  expect(signedUpload).toHaveBeenCalledWith(`${id}/${id}/${id}.csv`, {
    upsert: false,
  });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("rejects a forged actor, endpoint mismatch and overflowing file metadata before commands", async () => {
  expect(
    (
      await writeBatch(
        request({ ...registration, actor_id: id }),
        id,
        "register",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await writeBatch(
        request({
          ...registration,
          batch_id: "20000000-0000-4000-8000-000000000002",
        }),
        id,
        "register",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await writeBatch(
        request({
          ...registration,
          source: { ...registration.source, bytes: 20 * 1024 * 1024 + 1 },
        }),
        id,
        "register",
      )
    ).status,
  ).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("retains the registration when storage is unavailable and maps revised work to conflict", async () => {
  signedUpload.mockResolvedValue({
    data: null,
    error: { message: "Storage unavailable" },
  });
  expect((await writeBatch(request(registration), id, "register")).status).toBe(
    503,
  );
  rpc.mockResolvedValue({
    data: null,
    error: { code: "40001", message: "Revision changed" },
  });
  expect((await writeBatch(request(registration), id, "register")).status).toBe(
    409,
  );
});
it("cannot mint a download URL for a source outside the authorized batch", async () => {
  rpc.mockResolvedValue({ data: { sources: [] }, error: null });
  expect(
    (
      await readBatch(
        new Request(
          `http://localhost/api/stock-intake-batches/${id}?download=${id}`,
        ),
        id,
      )
    ).status,
  ).toBe(404);
  expect(signedRead).not.toHaveBeenCalled();
});
it("bounds streamed JSON bytes without trusting Content-Length", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1));
      controller.close();
    },
  });
  const input = new Request("http://localhost/api/stock-intake-batches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  expect((await writeBatch(input)).status).toBe(413);
  expect(rpc).not.toHaveBeenCalled();
});
