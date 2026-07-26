declare module 'jspdf-autotable' {
  const autoTable: (doc: unknown, options: Record<string, unknown>) => void;
  export default autoTable;
}

declare interface BluetoothRemoteGATTCharacteristicProperties {
  write?: boolean;
  writeWithoutResponse?: boolean;
}

declare interface BluetoothRemoteGATTCharacteristic {
  properties: BluetoothRemoteGATTCharacteristicProperties;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}

declare interface BluetoothRemoteGATTService {
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

declare interface BluetoothRemoteGATTServer {
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
}

declare interface BluetoothDevice {
  gatt?: BluetoothRemoteGATTServer;
  name?: string;
}

declare interface Bluetooth {
  requestDevice(options: Record<string, unknown>): Promise<BluetoothDevice>;
}

declare interface Navigator {
  bluetooth: Bluetooth;
  usb: USB;
}

declare interface USBDevice {
  open(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  close(): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<{ status: string }>;
  configuration: USBConfiguration | null;
  productName?: string;
}

declare interface USBConfiguration {
  interfaces: USBInterface[];
}

declare interface USBInterface {
  interfaceNumber: number;
  alternates: USBAlternateInterface[];
}

declare interface USBAlternateInterface {
  endpoints: USBEndpoint[];
}

declare interface USBEndpoint {
  direction: 'in' | 'out';
  type: 'bulk' | 'interrupt' | 'isochronous' | 'control';
  endpointNumber: number;
}

declare interface USB {
  requestDevice(options: { filters: Array<Record<string, unknown>> }): Promise<USBDevice>;
}
