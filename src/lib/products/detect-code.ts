type DetectorConstructor = new () => { detect(source: ImageBitmap): Promise<{ rawValue: string }[]> };
export function supportsBarcodeDetection(): boolean {
  return typeof window !== 'undefined';
}
export async function detectProductCode(file: File): Promise<string> {
  const Detector = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  if (Detector && typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const codes = [...new Set((await new Detector().detect(bitmap)).map(c => c.rawValue.trim()).filter(Boolean))];
      if (codes.length > 1) throw new Error('Multiple codes found. Photograph one code or enter it manually.');
      if (codes.length === 1) return codes[0];
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Multiple codes')) throw error;
    } finally { bitmap?.close(); }
  }

  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const url = URL.createObjectURL(file);
  try {
    const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
    const code = result.getText().trim();
    if (code) return code;
  } catch {
    // Both decoders can fail on a blurred or incomplete photo.
  } finally {
    URL.revokeObjectURL(url);
  }
  throw new Error('No code found. Try a clearer photo or enter the code manually.');
}
