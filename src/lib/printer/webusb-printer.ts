/**
 * WebUSB transport for thermal receipt printers.
 *
 * Supported in Chrome/Edge/Opera on desktop and Android. NOT supported in
 * Safari (desktop or iOS) or Firefox — callers must check
 * `isWebUSBSupported()` and offer a fallback (browser print / PDF download)
 * when it's false.
 *
 * Connecting requires a direct user gesture (must be called from a click
 * handler), which is a browser security requirement — it cannot be
 * triggered automatically from an effect or on page load.
 *
 * This targets the common case of USB thermal printers that expose a
 * vendor-specific "printer" interface with a bulk OUT endpoint — true of
 * the large majority of cheap ESC/POS USB receipt printers. Some very
 * unusual models may need per-vendor tweaks to the interface/endpoint
 * discovery below.
 */

export interface ConnectedUsbPrinter {
  device: USBDevice;
  interfaceNumber: number;
  outEndpoint: number;
}

export function isWebUSBSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

export async function connectUsbPrinter(): Promise<ConnectedUsbPrinter> {
  if (!isWebUSBSupported()) {
    throw new Error('WebUSB is not supported in this browser.');
  }

  // No vendor/product ID filter — let the user pick from whatever USB
  // devices are attached. Most OSes will only surface external peripherals
  // here anyway. A production deployment could narrow this with a curated
  // filters list of known printer vendor IDs if desired.
  const device = await navigator.usb.requestDevice({ filters: [] });

  await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }

  // Find the first interface with a bulk OUT endpoint — this is how ESC/POS
  // USB printers universally receive print data.
  const config = device.configuration;
  if (!config) throw new Error('USB device has no configuration.');

  let interfaceNumber = -1;
  let outEndpoint = -1;

  for (const iface of config.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find(
        (e) => e.direction === 'out' && e.type === 'bulk'
      );
      if (out) {
        interfaceNumber = iface.interfaceNumber;
        outEndpoint = out.endpointNumber;
        break;
      }
    }
    if (interfaceNumber !== -1) break;
  }

  if (interfaceNumber === -1) {
    await device.close();
    throw new Error(
      'Selected USB device has no printable (bulk OUT) endpoint — it may not be a supported printer.'
    );
  }

  await device.claimInterface(interfaceNumber);

  return { device, interfaceNumber, outEndpoint };
}

export async function printViaUsb(
  printer: ConnectedUsbPrinter,
  data: Uint8Array
): Promise<void> {
  // Some TS lib.dom versions type transferOut's `data` param as requiring an
  // ArrayBuffer-backed view specifically (not the broader ArrayBufferLike
  // that Uint8Array's generic allows) — copying into a fresh Uint8Array
  // guarantees a plain ArrayBuffer backing and satisfies that at runtime
  // with zero behavior change.
  const payload = new Uint8Array(data);
  const result = await printer.device.transferOut(printer.outEndpoint, payload);
  if (result.status !== 'ok') {
    throw new Error(`USB print failed with status: ${result.status}`);
  }
}

export async function disconnectUsbPrinter(printer: ConnectedUsbPrinter): Promise<void> {
  try {
    await printer.device.releaseInterface(printer.interfaceNumber);
  } catch {
    // ignore — device may already be disconnected
  }
  try {
    await printer.device.close();
  } catch {
    // ignore
  }
}
