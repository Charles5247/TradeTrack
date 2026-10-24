import { getAccountRevision } from "@/lib/auth/account-state";

export async function intakeRequest<T>(
  url: string,
  body?: unknown,
): Promise<T> {
  const revision = getAccountRevision();
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (revision !== getAccountRevision())
    throw new Error(
      "Account changed. Reopen the receipt in its original account.",
    );
  if (!response.ok)
    throw new Error(value.error ?? "Could not complete receipt request");
  return value as T;
}
