# Try receiving stock from a spreadsheet

Receiving stock has three steps: **upload the file → check the products → review and save**. Uploading or checking a product does not change your stock. Only the final approval saves the delivery.

## Continue from an uploaded file

Open **Inventory → Spreadsheet batch**, or visit `http://localhost:3000/inventory/intake/batches`. If necessary, expand **Start a new delivery or open a saved batch** and choose your saved batch. You do not need to upload the same file again.

1. Click **Check products** in the **What to do next** card.
2. Click **Check product** beside the first item. The left side shows your file; the right side shows the values that will be saved.
3. Check the quantity received, the pack type, the stock units inside each pack and the cost of one received pack. If your draft was accidentally changed, **Use pack details from file** copies the original quantity, pack type and pack size into this form. Check them before saving.
4. Read the stock calculation. Tick **I checked the product and pack size. The stock calculation above is correct.** Then click **Save product check**. Repeat for the other item.
5. Click **Continue to receipt totals**. Wait for the receipts to become ready. Check the invoice grouping, location and costs. This step still does not change stock.
6. Under **Review and save**, select the ready receipts you intend to save. Read the summary, tick the review checkbox and click **Approve and add … receipts to stock** once. Wait for the saved receipt result.

For the development sample `sample-intake.xlsx`, the original file contains:

| Product | Quantity received | Pack size | Stock added | Cost of one carton |
| --- | --- | --- | --- | --- |
| Rice | 10 cartons | 12 pieces per carton | 120 pieces | NGN 12,000 |
| Beans | 3 cartons | 10 pieces per carton | 30 pieces | NGN 8,000 |

Both items belong to invoice `DEV-DELIVERY-001` at **Main Store**. If these are the intended values, the receipt total is **NGN 144,000**. Check the current inventory afterward: it should have increased by 120 rice and 30 beans. Other stock changes can affect the final balance. Receiving these existing products does not change their catalog costs or selling prices.

## Start with a new file

Create a new batch for **Additional deliveries**, choose its location, and upload a CSV or XLSX file. Choose **Select worksheets**, select the sheets to include, and check the suggested column assignments before saving. Unrecognized or ambiguous headings need your selection. Then click **Read selected sheets** and follow the product checks above.

## If you cannot continue

- **Check the pack size and confirm it:** check the quantity, pack type and units per pack in **Check product**, tick its confirmation and save.
- **Enter the purchase cost:** enter the cost of one received pack. A blank cost is not treated as zero.
- **Choose or confirm the product:** choose the correct existing product, or review the new-product draft and its prices explicitly.
- **No receipts are ready:** finish the product checks, then click **Continue to receipt totals**. The final approval stays unavailable until there is a ready receipt.
- **Processing does not finish:** keep the development app and stock-intake worker running. An accepted upload stays saved if you close the browser.

For the first attempt, use the two-item sample above. Leave the separate exception sample for a later test.
