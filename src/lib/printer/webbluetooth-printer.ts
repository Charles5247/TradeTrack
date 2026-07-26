/**
 * WebBluetooth transport for thermal receipt printers.
 *
 * Supported in Chrome/Edge on desktop and Android. NOT supported in Safari
 * (desktop or iOS, at all) or Firefox — callers must check
 * `isWebBluetoothSupported()` and offer a fallback when it's false. This is
 * the transport most likely to matter for phone-based cashiers on Android;
 * iPhone users will need the browser print/PDF fallback regardless, since
 * iOS Safari does not expose WebBluetooth or WebUSB at all.
 *
 * Connecting requires a direct user gesture (a click handler) — a browser
 * security requirement.
 *
 * Cheap BLE ESC/POS thermal printers vary in which GATT service/
 * characteristic they expose for "send raw bytes to print". There is no
 * single official standard the way there is for classic Bluetooth SPP.
 * This implementation:
 *   1. Requests any Bluetooth device (the user picks their printer from the
 *      OS pairing sheet), advertising a generous `optionalServices` list
 *      covering the service UUIDs most commonly used by inexpensive ESC/POS
 *      BLE printer modules.
 *   2. Scans the connected device's GATT services/characteristics for the
 *      first one that supports `write` or `writeWithoutResponse`, and uses
 *      that as the print channel.
 * This generic-discovery approach is deliberately used instead of hardcoding
 * one vendor's UUID, since printer hardware varies. A specific printer model
 * that doesn't expose a writable characteristic in a standard GATT service
 * (rare, but possible with fully proprietary firmware) would not work with
 * this generic approach and may need a vendor SDK instead.
 */

// Common service UUIDs seen on inexpensive BLE ESC/POS thermal printers.
// Listed as optionalServices so the browser will disclose them if present;
// harmless to list even if a given printer doesn't use them.
const COMMON_PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // widely used by generic BLE printer modules
  '0000ff00-0000-1000-8000-00805f9b34fb', // common vendor-specific serial-like service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip transparent UART, used by some printer boards
];

export interface ConnectedBluetoothPrinter {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  writeCharacteristic: BluetoothRemoteGATTCharacteristic;
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer
): Promise<BluetoothRemoteGATTCharacteristic> {
  const services = await server.getPrimaryServices();

  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    const writable = characteristics.find(
      (c) => c.properties.write || c.properties.writeWithoutResponse
    );
    if (writable) return writable;
  }

  throw new Error(
    'No writable Bluetooth characteristic found on this device — it may not be a supported printer.'
  );
}

export async function connectBluetoothPrinter(): Promise<ConnectedBluetoothPrinter> {
  if (!isWebBluetoothSupported()) {
    throw new Error('WebBluetooth is not supported in this browser.');
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: COMMON_PRINTER_SERVICE_UUIDS,
  });

  if (!device.gatt) {
    throw new Error('Selected Bluetooth device does not support GATT.');
  }

  const server = await device.gatt.connect();
  const writeCharacteristic = await findWritableCharacteristic(server);

  return { device, server, writeCharacteristic };
}

/**
 * BLE has a small MTU (often ~20 bytes per write on older stacks). Sending
 * a whole receipt in one write() frequently fails or truncates silently, so
 * we chunk it — this is the single most common cause of "it connects but
 * won't print" with cheap BLE thermal printers.
 */
async function writeInChunks(
  characteristic: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array,
  chunkSize = 180
) {
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.slice(offset, offset + chunkSize);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValueWithResponse(chunk);
    }
    // Small delay between chunks — many cheap printer modules drop bytes if
    // flooded faster than their buffer can drain.
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export async function printViaBluetooth(
  printer: ConnectedBluetoothPrinter,
  data: Uint8Array
): Promise<void> {
  await writeInChunks(printer.writeCharacteristic, data);
}

export async function disconnectBluetoothPrinter(
  printer: ConnectedBluetoothPrinter
): Promise<void> {
  try {
    printer.device.gatt?.disconnect();
  } catch {
    // ignore — device may already be disconnected
  }
}
