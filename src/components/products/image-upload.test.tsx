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
  expect(dialog.textContent).toContain('Take a photo');expect(dialog.textContent).toContain('Scan barcode / QR');expect(dialog.textContent).toContain('Upload a photo');
  const link=dialog.querySelector('a')!;expect(link.getAttribute('href')).toBe('/imports');expect(link.getAttribute('target')).toBe('_blank');
  expect(host.querySelector('[aria-label="Take product photo"]')?.getAttribute('capture')).toBe('environment');
  expect(host.querySelector('[aria-label="Upload product photo"]')?.hasAttribute('capture')).toBe(false);
  const camera=vi.spyOn(host.querySelector<HTMLInputElement>('[aria-label="Take product photo"]')!,'click').mockImplementation(()=>{});
  await act(()=>Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent?.includes('Take a photo'))!.click());
  expect(camera).toHaveBeenCalledOnce();
});
it('opens through the keyboard and exposes manual scanning fallback',async()=>{
  await act(()=>root.render(<ImageUpload onImageUploaded={vi.fn()} onImageRemoved={vi.fn()} onProductMatched={vi.fn()} onCodeSelected={vi.fn()} />));
  await act(()=>host.querySelector('[role="button"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  await act(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.includes('Scan barcode'))!.click());
  expect(document.body.textContent).toContain('not supported');
  expect(document.querySelector('#product-code')).not.toBeNull();
});
it('keeps gallery selection separate from capture and makes removal available without hovering',async()=>{
  const removed=vi.fn();
  await act(()=>root.render(<ImageUpload currentImageUrl="/test-product.png" onImageUploaded={vi.fn()} onImageRemoved={removed} onProductMatched={vi.fn()} onCodeSelected={vi.fn()} />));
  expect(host.querySelector('[aria-label="Remove image"]')).not.toBeNull();
  await act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Replace image"]')!.click());
  const gallery=vi.spyOn(host.querySelector<HTMLInputElement>('[aria-label="Upload product photo"]')!,'click').mockImplementation(()=>{});
  await act(()=>Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent?.includes('Upload a photo'))!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(gallery).toHaveBeenCalledOnce();
  await act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Remove image"]')!.click());
  expect(removed).toHaveBeenCalledOnce();expect(host.querySelector('img')).toBeNull();
});
