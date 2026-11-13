import { describe, expect, it } from 'vitest';
import { installedAndroidVersion, isNewerVersion } from './android-update';

describe('Android APK update detection', () => {
  it('reads the tagged native shell and recognises older WebView builds', () => {
    expect(installedAndroidVersion('Mozilla/5.0 (Linux; Android 14; wv) TrackasuwaAndroid/1.0.2')).toBe('1.0.2');
    expect(installedAndroidVersion('Mozilla/5.0 (Linux; Android 13; wv)')).toBe('0.0.0');
    expect(installedAndroidVersion('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile')).toBeNull();
  });

  it('only offers strictly newer valid releases', () => {
    expect(isNewerVersion('1.0.2', '1.0.1')).toBe(true);
    expect(isNewerVersion('1.0.2', '1.0.2')).toBe(false);
    expect(isNewerVersion('1.0.1', '1.0.2')).toBe(false);
    expect(isNewerVersion(null, '1.0.1')).toBe(false);
  });
});
