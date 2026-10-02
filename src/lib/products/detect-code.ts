type DetectorConstructor = new () => { detect(source: ImageBitmap): Promise<{ rawValue: string }[]> };
export function supportsBarcodeDetection(): boolean {
  return typeof (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector === 'function' && typeof createImageBitmap === 'function';
}
export async function detectProductCode(file: File): Promise<string> {
  const Detector = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  if (!Detector || !supportsBarcodeDetection()) throw new Error('Scanning is not supported by this browser. Enter the code manually.');
  const bitmap = await createImageBitmap(file);
  try {
    const codes = [...new Set((await new Detector().detect(bitmap)).map(c => c.rawValue.trim()).filter(Boolean))];
    if (!codes.length) throw new Error('No code found. Try a clearer photo or enter the code manually.');
    if (codes.length > 1) throw new Error('Multiple codes found. Photograph one code or enter it manually.');
    return codes[0];
  } finally { bitmap.close(); }
}
