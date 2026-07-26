/**
 * A distinct receipt/slip model for warehouse stock transfers — separate
 * from the sales `ReceiptData` (build-receipt.ts). Rendered as a
 * "STOCK TRANSFER NOTE" instead of "CASH RECEIPT": no totals/payment
 * section, but shows From/To warehouse, product, quantity and the three
 * accountability fields (initiated / approved / coordinated by), plus a
 * scannable barcode encoding the transfer reference.
 */
export interface TransferReceiptData {
  kind: "transfer";
  orgName: string;
  orgAddress?: string;
  orgPhone?: string;
  transferRef: string;
  dateISO: string;
  fromWarehouse: string;
  toWarehouse: string;
  productName: string;
  productSku?: string;
  quantity: number;
  status: string;
  initiatedBy?: string;
  approvedBy?: string;
  coordinatedBy?: string;
  sentBy?: string;
  receivedBy?: string;
  notes?: string;
  barcodeValue?: string;
}

export interface BuildTransferReceiptInput {
  transfer: {
    id: string;
    from_warehouse_id: string;
    to_warehouse_id: string;
    quantity: number;
    status: string;
    notes?: string | null;
    date_sent?: string | null;
    initiated_by?: string | null;
    approved_by?: string | null;
    coordinated_by?: string | null;
  };
  fromWarehouseName: string;
  toWarehouseName: string;
  productName: string;
  productSku?: string;
  sentByName?: string;
  receivedByName?: string;
  orgName: string;
  orgAddress?: string;
  orgPhone?: string;
}

export function buildTransferReceiptData({
  transfer,
  fromWarehouseName,
  toWarehouseName,
  productName,
  productSku,
  sentByName,
  receivedByName,
  orgName,
  orgAddress,
  orgPhone,
}: BuildTransferReceiptInput): TransferReceiptData {
  const transferRef = `TRF-${transfer.id.slice(0, 8).toUpperCase()}`;
  return {
    kind: "transfer",
    orgName,
    orgAddress,
    orgPhone,
    transferRef,
    dateISO: transfer.date_sent || new Date().toISOString(),
    fromWarehouse: fromWarehouseName,
    toWarehouse: toWarehouseName,
    productName,
    productSku,
    quantity: transfer.quantity,
    status: transfer.status,
    initiatedBy: transfer.initiated_by || undefined,
    approvedBy: transfer.approved_by || undefined,
    coordinatedBy: transfer.coordinated_by || undefined,
    sentBy: sentByName,
    receivedBy: receivedByName,
    notes: transfer.notes || undefined,
    barcodeValue: transferRef,
  };
}
