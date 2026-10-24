// Browser proof uses actual application components, synthetic session transport.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryProvider } from "@/components/shared/query-provider";
import { BatchStockIntake } from "@/components/inventory/batch-stock-intake";
import { useAuthStore } from "@/store";
import type { User } from "@/types";

const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (
    new URL(url, location.href).origin === location.origin &&
    url.includes("/api/")
  ) {
    const headers = new Headers(init?.headers);
    headers.set("x-m0-actor", useAuthStore.getState().user?.id ?? "");
    return originalFetch(input, { ...init, headers });
  }
  return originalFetch(input, init);
};
function App() {
  const [seed, setSeed] = useState<{ profile: User; other: User } | null>(null);
  useEffect(() => {
    void fetch("/seed")
      .then((r) => r.json())
      .then((value) => {
        setSeed(value);
        useAuthStore.getState().setUser(value.profile);
      });
  }, []);
  if (!seed) return <p>Loading synthetic session…</p>;
  return (
    <>
      <aside className="flex flex-wrap gap-3 border-b p-3">
        <span>
          Synthetic local acceptance. Hosted JWT/storage transport is not
          verified here.
        </span>
        <button onClick={() => useAuthStore.getState().setUser(seed.other)}>
          Switch to other shop
        </button>
        <button onClick={() => useAuthStore.getState().setUser(seed.profile)}>
          Return to test shop
        </button>
      </aside>
      <BatchStockIntake />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryProvider>
    <App />
  </QueryProvider>,
);
