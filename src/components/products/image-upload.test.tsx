// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('next/image',()=>({default:({fill: _fill,...props}: any)=><img {...props} />}));
vi.mock('next/link',()=>({default:({prefetch: _prefetch,...props}: any)=><a {...props} />}));
vi.mock('@/store',()=>({useAuthStore:()=>({user:{organization_id:'org'}})}));
vi.mock('@/lib/supabase/client',()=>({createClient:vi.fn()}));
import { ImageUpload } from './image-upload';
let root: Root; let host: HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(()=>root.unmount());host.remove();vi.restoreAllMocks();});
it.each([375,1280])('presents all four grouped choices at %ipx with camera/gallery separation and import shortcut',async width=>{
  Object.defineProperty(window,'innerWidth',{configurable:true,value:width});
  await act(()=>root.render(<ImageUpload onImageUploaded={vi.fn()} onImageRemoved={vi.fn()} onProductMatched={vi.fn()} onCodeSelected={vi.fn()} />));
  await act(()=>host.querySelector<HTMLElement>('[role="button"]')!.click());
  const dialog=document.querySelector('[role="dialog"]')!;
  expect(host.textContent).toContain('Take a photo');expect(host.textContent).toContain('Choose from gallery');expect(dialog.textContent).toContain('Scan barcode / QR');
  const link=dialog.querySelector('a')!;expect(link.getAttribute('href')).toBe('/imports');expect(link.getAttribute('target')).toBe('_blank');
  expect(host.querySelector('[aria-label="Take product photo"]')?.getAttribute('capture')).toBe('environment');
  expect(host.querySelector('[aria-label="Upload product photo"]')?.hasAttribute('capture')).toBe(false);
  expect(host.querySelector<HTMLInputElement>('[aria-label="Take product photo"]')?.getAttribute('accept')).toBe('image/*');
});
it('opens through the keyboard and exposes manual scanning fallback',async()=>{
  await act(()=>root.render(<ImageUpload onImageUploaded={vi.fn()} onImageRemoved={vi.fn()} onProductMatched={vi.fn()} onCodeSelected={vi.fn()} />));
  await act(()=>host.querySelector('[role="button"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  await act(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.includes('Scan barcode'))!.click());
  expect(document.body.textContent).toContain('Scan with a photo');
  expect(document.querySelector('#product-code')).not.toBeNull();
});
it('keeps gallery selection separate from capture and makes removal available without hovering',async()=>{
  const removed=vi.fn();
  await act(()=>root.render(<ImageUpload currentImageUrl="/test-product.png" onImageUploaded={vi.fn()} onImageRemoved={removed} onProductMatched={vi.fn()} onCodeSelected={vi.fn()} />));
  expect(host.querySelector('[aria-label="Remove image"]')).not.toBeNull();
  await act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Replace image"]')!.click());
  expect(document.querySelector<HTMLInputElement>('[aria-label="Choose product photo from menu"]')?.getAttribute('type')).toBe('file');
  await act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Remove image"]')!.click());
  expect(removed).toHaveBeenCalledOnce();expect(host.querySelector('img')).toBeNull();
});
it('updates the preview when the parent selects a different product image',async()=>{
  const callbacks={onImageUploaded:vi.fn(),onImageRemoved:vi.fn(),onProductMatched:vi.fn(),onCodeSelected:vi.fn()};
  await act(()=>root.render(<ImageUpload currentImageUrl="/first.png" {...callbacks} />));
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/first.png');
  await act(()=>root.render(<ImageUpload currentImageUrl="/second.png" {...callbacks} />));
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/second.png');
});
it('opens the device camera on desktop and releases it when cancelled', async () => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
  const stop = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  await act(() => root.render(<ImageUpload onImageUploaded={vi.fn()} onImageRemoved={vi.fn()} onProductMatched={vi.fn()} onCodeSelected={vi.fn()} />));
  await act(() => host.querySelector<HTMLElement>('[role="button"]')!.click());
  await act(async () => { Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Use live camera'))!.click(); });
  expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  expect(document.querySelector('video[aria-label="Camera preview"]')).not.toBeNull();
  await act(() => { Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Cancel')!.click(); });
  expect(stop).toHaveBeenCalled();
  play.mockRestore();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
});
it('hides the webcam permission path on Android while keeping native camera and gallery inputs', async () => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 14)' });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
  await act(() => root.render(<ImageUpload onImageUploaded={vi.fn()} onImageRemoved={vi.fn()} onProductMatched={vi.fn()} onCodeSelected={vi.fn()} />));
  await act(() => host.querySelector<HTMLElement>('[role="button"]')!.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('Use live camera');
  expect(host.querySelector<HTMLInputElement>('[aria-label="Take product photo"]')?.getAttribute('capture')).toBe('environment');
  expect(host.querySelector<HTMLInputElement>('[aria-label="Upload product photo"]')?.hasAttribute('capture')).toBe(false);
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0' });
});
