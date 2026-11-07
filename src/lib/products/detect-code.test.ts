import { afterEach, expect, it, vi } from 'vitest';
import { detectProductCode } from './detect-code';
const decodeFromImageUrl = vi.fn();
vi.mock('@zxing/browser', () => ({ BrowserMultiFormatReader: class { decodeFromImageUrl = decodeFromImageUrl; } }));
afterEach(() => vi.unstubAllGlobals());
it('uses ZXing when the native detector is unavailable', async () => {
  vi.stubGlobal('BarcodeDetector', undefined);
  vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:test'), revokeObjectURL: vi.fn() });
  decodeFromImageUrl.mockResolvedValueOnce({ getText: () => '5901234123457' });
  await expect(detectProductCode({} as File)).resolves.toBe('5901234123457');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
});
it.each([['123',true],['',false]])('decodes a photo and releases its bitmap: %s', async (code, found) => {
  const close = vi.fn(); vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({close}));
  vi.stubGlobal('BarcodeDetector',class { async detect() { return code ? [{rawValue:code}] : []; } });
  if (!found) { vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:test'), revokeObjectURL: vi.fn() }); decodeFromImageUrl.mockRejectedValueOnce(new Error('not found')); }
  if(found) expect(await detectProductCode({} as File)).toBe('123');
  else await expect(detectProductCode({} as File)).rejects.toThrow('No code');
  expect(close).toHaveBeenCalledOnce();
});
it('releases the bitmap and uses ZXing if native detection fails', async () => {
  const close=vi.fn(); vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({close}));
  vi.stubGlobal('BarcodeDetector',class { async detect() { throw new Error('unsupported format'); } });
  vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:test'), revokeObjectURL: vi.fn() });
  decodeFromImageUrl.mockResolvedValueOnce({ getText: () => '123' });
  await expect(detectProductCode({} as File)).resolves.toBe('123');
  expect(close).toHaveBeenCalledOnce();
});
