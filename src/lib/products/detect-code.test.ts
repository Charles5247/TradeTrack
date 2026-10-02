import { afterEach, expect, it, vi } from 'vitest';
import { detectProductCode } from './detect-code';
afterEach(() => vi.unstubAllGlobals());
it('provides manual fallback when the detector is unsupported', async () => {
  vi.stubGlobal('BarcodeDetector', undefined);
  await expect(detectProductCode({} as File)).rejects.toThrow('manually');
});
it.each([['123',true],['',false]])('decodes a photo and releases its bitmap: %s', async (code, found) => {
  const close = vi.fn(); vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({close}));
  vi.stubGlobal('BarcodeDetector',class { async detect() { return code ? [{rawValue:code}] : []; } });
  if(found) expect(await detectProductCode({} as File)).toBe('123');
  else await expect(detectProductCode({} as File)).rejects.toThrow('No code');
  expect(close).toHaveBeenCalledOnce();
});
it('releases the bitmap if native detection fails', async () => {
  const close=vi.fn(); vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({close}));
  vi.stubGlobal('BarcodeDetector',class { async detect() { throw new Error('unsupported format'); } });
  await expect(detectProductCode({} as File)).rejects.toThrow('unsupported format');
  expect(close).toHaveBeenCalledOnce();
});
