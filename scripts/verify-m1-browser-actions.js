/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI consumes this function expression. */
async (page) => {
  const checks = []
  const check = (name, value) => {
    if (!value) throw new Error(name)
    checks.push({ name, status: "passed" })
  }
  const stock = async () =>
    Number(
      await (await page.request.get("http://127.0.0.1:57139/stock")).text(),
    )
  const waitHeading = (name) =>
    page.getByRole("heading", { name, exact: true }).waitFor({ timeout: 60000 })
  const invoice = `BROWSER-M1-${Date.now()}`
  await page.goto("http://127.0.0.1:57139/m1")
  await page
    .getByText("Fixture ready. All records are synthetic.")
    .waitFor({ timeout: 60000 })
  await page
    .getByLabel("Location", { exact: true })
    .selectOption({ label: "Synthetic location" })
  await page.getByLabel("Find catalog products by name").fill("M1 pager item")
  await page.getByRole('button',{name:'More catalog matches',exact:true}).click()
  await page.getByLabel('Product 1',{exact:true}).selectOption('31000000-0000-4000-8000-000000000030',{timeout:60000})
  check('catalog pagination exposes variants beyond the first 25 matches',await page.getByLabel('Product 1',{exact:true}).inputValue()==='31000000-0000-4000-8000-000000000030')
  await page.getByLabel("Find catalog products by name").fill("Synthetic rice")
  await page
    .getByLabel("Product 1", { exact: true })
    .selectOption("30000000-0000-0000-0000-000000000001", { timeout: 60000 })
  await page.getByLabel("Supplier (optional)").fill("Browser supplier")
  await page.getByLabel("Invoice reference (optional)").fill(invoice)
  await page.getByLabel("Purchase quantity 1", { exact: true }).fill("10")
  await page.getByLabel("Purchase unit 1", { exact: true }).fill("carton")
  await page
    .getByLabel("Stock units per purchase unit 1", { exact: true })
    .fill("12")
  await page
    .getByLabel("Cost per purchase unit 1", { exact: true })
    .fill("3.25")
  await page.getByRole("checkbox", { name: /I confirm/ }).check()
  const before = await stock()
  await page
    .getByRole("button", { name: "Prepare receipt for review", exact: true })
    .click()
  await waitHeading("Review receipt")
  await page
    .getByRole("button", { name: "Approve and save receipt", exact: true })
    .click({ trial: true })
  await page
    .getByText("Additional delivery · Synthetic location", { exact: true })
    .waitFor({ timeout: 60000 })
  check(
    "server review records the full carton conversion",
    (await page.getByText("+120 stock units", { exact: true }).count()) === 1,
  )
  check(
    "review shows exact receipt purchase cost",
    /32\.50/.test(
      await page.getByText(/^Receipt purchase cost:/).textContent(),
    ),
  )
  check('review current and expected stock reflect the selected location',await page.getByText(new RegExp(`Current snapshot: ${before}.*${before+120}`)).count()===1)
  await page.setViewportSize({ width: 1280, height: 900 })
  check(
    "desktop review has no horizontal overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  )
  await page.screenshot({
    path: "build-evidence/m1/review-desktop.png",
    fullPage: true,
  })
  await page
    .getByRole("button", { name: "Switch to other shop", exact: true })
    .click()
  await page.getByText("Current account: Other shop", { exact: true }).waitFor()
  check(
    "account switching hides the original merchant receipt",
    (await page.getByText(invoice, { exact: true }).count()) === 0,
  )
  await page
    .getByRole("button", { name: "Return to test shop", exact: true })
    .click()
  const history = page.getByRole("region", { name: "Saved receipts" })
  const row = history.getByRole("listitem").filter({ hasText: invoice })
  await row.waitFor({ timeout: 60000 })
  await row.getByRole("button", { name: "Open receipt", exact: true }).click()
  await waitHeading("Review receipt")
  check(
    "prepared receipt remains available after an account switch",
    (await page.getByText("+120 stock units", { exact: true }).count()) === 1,
  )
  await page
    .getByRole("button", { name: "Lose next acknowledgment", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Approve and save receipt", exact: true })
    .focus()
  await page.keyboard.press("Enter")
  await page
    .getByRole("alert")
    .filter({ hasText: "Simulated acknowledgment loss after receipt commit" })
    .waitFor({ timeout: 60000 })
  check(
    "lost response still commits exactly one delivery increment",
    (await stock()) === before + 120,
  )
  await page
    .getByRole("button", { name: "Retry approved receipt", exact: true })
    .click()
  await waitHeading("Receipt saved")
  check(
    "retry consumes the original approval without adding stock twice",
    (await stock()) === before + 120,
  )
  await page.reload()
  await page
    .getByText("Fixture ready. All records are synthetic.")
    .waitFor({ timeout: 60000 })
  await history
    .getByRole("listitem")
    .filter({ hasText: invoice })
    .getByRole("button", { name: "Open receipt", exact: true })
    .click()
  await waitHeading("Receipt saved")
  check(
    "reload recovers the authoritative committed receipt",
    (await stock()) === before + 120,
  )
  await page.setViewportSize({ width: 375, height: 812 })
  await page
    .getByText("Additional delivery · Synthetic location", { exact: true })
    .waitFor({ timeout: 60000 })
  check(
    "mobile saved receipt has no horizontal overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  )
  await page.screenshot({
    path: "build-evidence/m1/saved-mobile.png",
    fullPage: true,
  })
  await page
    .getByRole("button", { name: "Start another receipt", exact: true })
    .click()
  await page
    .getByLabel("Location", { exact: true })
    .selectOption({ label: "Synthetic location" })
  await page.getByLabel("Product 1", { exact: true }).selectOption("new")
  const sku = `M1-UI-${Date.now()}`
  await page
    .getByLabel("New product name 1", { exact: true })
    .fill("Reviewed browser product")
  await page.getByLabel("New product sku 1", { exact: true }).fill(sku)
  await page.getByLabel("Catalog selling price 1", { exact: true }).fill("3")
  await page.getByLabel("Catalog cost 1", { exact: true }).fill("2")
  await page
    .getByRole("checkbox", {
      name: "I reviewed this new product identity and its catalog prices",
      exact: true,
    })
    .check()
  await page.getByLabel("Purchase quantity 1", { exact: true }).fill("2")
  await page.getByLabel("Purchase unit 1", { exact: true }).fill("carton")
  await page
    .getByLabel("Stock units per purchase unit 1", { exact: true })
    .fill("6")
  await page.getByLabel("Cost per purchase unit 1", { exact: true }).fill("25")
  await page.getByRole("checkbox", { name: /I confirm/ }).check()
  await page
    .getByRole("button", {
      name: "Add another line using this product draft",
      exact: true,
    })
    .click()
  await page.getByLabel("Purchase quantity 2", { exact: true }).fill("3")
  await page
    .getByRole("checkbox", { name: /I confirm/ })
    .nth(1)
    .check()
  await page
    .getByRole("button", { name: "Prepare receipt for review", exact: true })
    .click()
  await waitHeading("Review receipt")
  check(
    "every shared-draft line remains inspectable",
    (await page
      .getByRole("heading", {
        name: `Reviewed browser product · ${sku}`,
        exact: true,
      })
      .count()) === 2,
  )
  check(
    "receipt cost remains separate from new catalog cost",
    /125\.00/.test(
      await page.getByText(/^Receipt purchase cost:/).textContent(),
    ),
  )
  await page
    .getByRole("button", { name: "Approve and save receipt", exact: true })
    .click()
  await waitHeading("Receipt saved")
  check(
    "shared draft posts both lines atomically to one product",
    (await page
      .getByText("All 2 lines saved together.", { exact: true })
      .count()) === 1 &&
      (await page
        .getByText("Added 30 units · balance immediately after posting: 30", {
          exact: true,
        })
        .count()) === 1,
  )
  await page
    .getByRole("button", { name: "Start another receipt", exact: true })
    .click()
  check(
    "an omitted purchase cost stays blank",
    (await page
      .getByLabel("Cost per purchase unit 1", { exact: true })
      .inputValue()) === "",
  )
  await page
    .getByLabel("Receipt notes", { exact: true })
    .fill("Unprepared original-shop draft")
  await history
    .getByRole("button", { name: "Open receipt", exact: true })
    .first()
    .click()
  await waitHeading("Replace this local draft?")
  await page.getByRole("button", { name: "Keep editing", exact: true }).click()
  check(
    "opening history cannot silently replace an edited draft",
    (await page.getByLabel("Receipt notes", { exact: true }).inputValue()) ===
      "Unprepared original-shop draft",
  )
  await page
    .getByRole("button", { name: "Switch to other shop", exact: true })
    .click()
  await page.getByText("Current account: Other shop", { exact: true }).waitFor()
  check(
    "local draft text is isolated from another merchant",
    (await page.getByLabel("Receipt notes", { exact: true }).inputValue()) ===
      "",
  )
  await page
    .getByRole("button", { name: "Return to test shop", exact: true })
    .click()
  await page.getByText("Current account: Test shop", { exact: true }).waitFor()
  check(
    "returning to the account restores its unprepared draft",
    (await page.getByLabel("Receipt notes", { exact: true }).inputValue()) ===
      "Unprepared original-shop draft",
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  check(
    "reduced-motion browser preference is enabled",
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  )
  return {
    generatedAt: new Date().toISOString(),
    synthetic: true,
    hostedAuthVerified: false,
    beforeStock: before,
    afterStock: await stock(),
    invoice,
    sku,
    checks,
  }
}
