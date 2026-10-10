// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from './locales/en';
import { ha } from './locales/ha';
import { yo } from './locales/yo';
import { ig } from './locales/ig';
import { pcm } from './locales/pcm';
import { I18nProvider, useI18n } from './index';
import { isLocale, LOCALE_STORAGE_KEY } from './locale';
import { translateCopy } from './translate';
import { messages } from './messages';
import { LanguageSelect } from '@/components/shared/language-select';
import { Hero } from '@/components/marketing/hero';
import { StatsBand } from '@/components/marketing/stats-band';
import { TranslatedText } from './text';

vi.mock('@/components/marketing/reveal', () => ({ Reveal: ({children}: {children: React.ReactNode}) => <>{children}</> }));
vi.mock('@/hooks/use-scroll-y', () => ({useScrollY: () => 0}));
vi.mock('@/store', () => ({useUIStore:{getState:()=>({setLocale:vi.fn()})}}));

function flatten(obj: Record<string, unknown>, prefix=''): Record<string,string> {
  return Object.fromEntries(Object.entries(obj).flatMap(([key,value]) => typeof value === 'string' ? [[prefix+key,value]] : Object.entries(flatten(value as Record<string,unknown>,prefix+key+'.'))));
}
const placeholders=(text:string)=>[...text.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort();
describe('translation catalogs', () => {
  const english=flatten(en);
  for(const [locale,catalog] of Object.entries({ha,yo,ig,pcm})) it(`${locale} retains every key and interpolation token`,()=>{
    const translated=flatten(catalog);
    expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
    for(const [key,value] of Object.entries(english)) {
      expect(translated[key],key).toBeTruthy();
      expect(placeholders(translated[key]),key).toEqual(placeholders(value));
    }
  });
  it('provides all four translations for each supplemental source message',()=>{
    for(const [source,translations] of Object.entries(messages)) for(const locale of ['ha','yo','ig','pcm'] as const) {
      expect(translations[locale],`${locale}: ${source}`).toBeTruthy();
      expect(placeholders(translations[locale]!),source).toEqual(placeholders(source));
    }
  });
  it('uses real Pidgin and leaves unknown merchant data unchanged',()=>{
    expect(pcm).not.toBe(en);
    expect(pcm.pos.sale_complete).toBe('Sale don complete!');
    expect(pcm.inventory.out_of_stock).toBe('Stock don finish');
    expect(translateCopy('pcm','Who supplies your products, what you ordered, and what arrived.')).toContain('wetin');
    expect(translateCopy('pcm','Adaeze & Sons 123')).toBe('Adaeze & Sons 123');
    expect(translateCopy('pcm','Price:')).toBe('Price:');
  });
  it('accepts only supported locale identifiers',()=>{
    expect(isLocale('pcm')).toBe(true);
    for(const value of ['__proto__','constructor','en-US','',null]) expect(isLocale(value)).toBe(false);
  });
});

let root: Root; let host: HTMLDivElement;
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  localStorage.clear(); document.cookie='NEXT_LOCALE=;max-age=0;path=/';
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
function Probe(){const {locale,t}=useI18n();return <p data-locale={locale}>{t.inventory.out_of_stock}</p>}
it('switches the real landing hero, statistic cards and operational labels to Pidgin immediately',async()=>{
  await act(async()=>root.render(<I18nProvider defaultLocale="en"><LanguageSelect/><Hero/><StatsBand/><Probe/><TranslatedText text="Receipt template"/></I18nProvider>));
  const select=host.querySelector('select')!;
  expect(select.options).toHaveLength(5);
  await act(async()=>{select.value='pcm';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(host.textContent).toContain('Sell quick. Restock with sense. No lose any sale.');
  expect(host.textContent).toContain('Roles wey get their own permissions');
  expect(host.textContent).toContain('Stock don finish');
  expect(host.textContent).toContain('Receipt style');
  expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pcm');
  expect(document.cookie).toContain('NEXT_LOCALE=pcm');
  expect(document.documentElement.lang).toBe('pcm');
});
it('retains the server locale when browser storage is empty and synchronizes tab changes',async()=>{
  await act(async()=>root.render(<I18nProvider defaultLocale="pcm"><Probe/></I18nProvider>));
  expect(host.querySelector('p')?.dataset.locale).toBe('pcm');
  await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:LOCALE_STORAGE_KEY,newValue:'ha'})));
  expect(host.querySelector('p')?.dataset.locale).toBe('ha');
  expect(document.documentElement.lang).toBe('ha');
});
it('ignores invalid saved locale names',async()=>{
  localStorage.setItem(LOCALE_STORAGE_KEY,'__proto__');
  await act(async()=>root.render(<I18nProvider><Probe/></I18nProvider>));
  expect(host.querySelector('p')?.dataset.locale).toBe('en');
});
