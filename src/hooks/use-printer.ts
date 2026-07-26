'use client';

import { useCallback, useRef, useState } from 'react';
import {
  isWebUSBSupported,
  connectUsbPrinter,
  printViaUsb,
  disconnectUsbPrinter,
  type ConnectedUsbPrinter,
} from '@/lib/printer/webusb-printer';
import {
  isWebBluetoothSupported,
  connectBluetoothPrinter,
  printViaBluetooth,
  disconnectBluetoothPrinter,
  type ConnectedBluetoothPrinter,
} from '@/lib/printer/webbluetooth-printer';
import { receiptToEscPos } from '@/lib/printer/receipt-to-escpos';
import { transferReceiptToEscPos } from '@/lib/printer/transfer-receipt-to-escpos';
import type { ReceiptData } from '@/lib/receipt/build-receipt';
import type { TransferReceiptData } from '@/lib/receipt/build-transfer-receipt';

export type PrinterTransport = 'usb' | 'bluetooth' | null;
export type PrinterStatus = 'disconnected' | 'connecting' | 'connected' | 'printing' | 'error';

interface PrinterState {
  status: PrinterStatus;
  transport: PrinterTransport;
  deviceName: string | null;
  error: string | null;
}

/**
 * Unified hook for connecting to and printing on a physical thermal
 * receipt printer, whether it's attached over USB or paired over
 * Bluetooth. Both connection methods require a direct user gesture (a
 * button click) per browser security rules — this hook's connect
 * functions are meant to be called straight from an onClick handler, not
 * from an effect.
 *
 * Neither transport is available in Safari or iOS (any browser) — check
 * `usbSupported` / `bluetoothSupported` before showing those options, and
 * fall back to the browser print dialog or PDF download when both are
 * false, which is the common case on iPhone.
 */
export function usePrinter() {
  const [state, setState] = useState<PrinterState>({
    status: 'disconnected',
    transport: null,
    deviceName: null,
    error: null,
  });

  const usbRef = useRef<ConnectedUsbPrinter | null>(null);
  const bluetoothRef = useRef<ConnectedBluetoothPrinter | null>(null);

  const usbSupported = isWebUSBSupported();
  const bluetoothSupported = isWebBluetoothSupported();

  const connectUsb = useCallback(async () => {
    setState((s) => ({ ...s, status: 'connecting', error: null }));
    try {
      const printer = await connectUsbPrinter();
      usbRef.current = printer;
      setState({
        status: 'connected',
        transport: 'usb',
        deviceName: printer.device.productName || 'USB Printer',
        error: null,
      });
    } catch (err) {
      setState({
        status: 'error',
        transport: null,
        deviceName: null,
        error: err instanceof Error ? err.message : 'Failed to connect USB printer',
      });
    }
  }, []);

  const connectBluetooth = useCallback(async () => {
    setState((s) => ({ ...s, status: 'connecting', error: null }));
    try {
      const printer = await connectBluetoothPrinter();
      bluetoothRef.current = printer;
      setState({
        status: 'connected',
        transport: 'bluetooth',
        deviceName: printer.device.name || 'Bluetooth Printer',
        error: null,
      });
    } catch (err) {
      setState({
        status: 'error',
        transport: null,
        deviceName: null,
        error: err instanceof Error ? err.message : 'Failed to connect Bluetooth printer',
      });
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (usbRef.current) {
      await disconnectUsbPrinter(usbRef.current);
      usbRef.current = null;
    }
    if (bluetoothRef.current) {
      await disconnectBluetoothPrinter(bluetoothRef.current);
      bluetoothRef.current = null;
    }
    setState({ status: 'disconnected', transport: null, deviceName: null, error: null });
  }, []);

  /**
   * Sends a receipt to whichever printer is currently connected. Returns
   * true if it printed via hardware, false if there's no printer connected
   * (the caller should fall back to window.print() or PDF download in
   * that case).
   */
  const printReceipt = useCallback(
    async (receipt: ReceiptData, charWidth = 32): Promise<boolean> => {
      if (state.transport === 'usb' && usbRef.current) {
        setState((s) => ({ ...s, status: 'printing' }));
        try {
          await printViaUsb(usbRef.current, receiptToEscPos(receipt, charWidth));
          setState((s) => ({ ...s, status: 'connected' }));
          return true;
        } catch (err) {
          setState((s) => ({
            ...s,
            status: 'error',
            error: err instanceof Error ? err.message : 'Print failed',
          }));
          return false;
        }
      }

      if (state.transport === 'bluetooth' && bluetoothRef.current) {
        setState((s) => ({ ...s, status: 'printing' }));
        try {
          await printViaBluetooth(bluetoothRef.current, receiptToEscPos(receipt, charWidth));
          setState((s) => ({ ...s, status: 'connected' }));
          return true;
        } catch (err) {
          setState((s) => ({
            ...s,
            status: 'error',
            error: err instanceof Error ? err.message : 'Print failed',
          }));
          return false;
        }
      }

      return false;
    },
    [state.transport]
  );

  /**
   * Same as `printReceipt` but for the distinct warehouse-transfer "Stock
   * Transfer Note" template.
   */
  const printTransferReceipt = useCallback(
    async (data: TransferReceiptData, charWidth = 32): Promise<boolean> => {
      if (state.transport === 'usb' && usbRef.current) {
        setState((s) => ({ ...s, status: 'printing' }));
        try {
          await printViaUsb(usbRef.current, transferReceiptToEscPos(data, charWidth));
          setState((s) => ({ ...s, status: 'connected' }));
          return true;
        } catch (err) {
          setState((s) => ({
            ...s,
            status: 'error',
            error: err instanceof Error ? err.message : 'Print failed',
          }));
          return false;
        }
      }

      if (state.transport === 'bluetooth' && bluetoothRef.current) {
        setState((s) => ({ ...s, status: 'printing' }));
        try {
          await printViaBluetooth(bluetoothRef.current, transferReceiptToEscPos(data, charWidth));
          setState((s) => ({ ...s, status: 'connected' }));
          return true;
        } catch (err) {
          setState((s) => ({
            ...s,
            status: 'error',
            error: err instanceof Error ? err.message : 'Print failed',
          }));
          return false;
        }
      }

      return false;
    },
    [state.transport]
  );

  return {
    ...state,
    usbSupported,
    bluetoothSupported,
    connectUsb,
    connectBluetooth,
    disconnect,
    printReceipt,
    printTransferReceipt,
    isConnected: state.status === 'connected' || state.status === 'printing',
  };
}
