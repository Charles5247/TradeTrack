// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'owner', role: 'platform_owner', organization_id: null as string | null, full_name: 'Xavier', email: 'owner@example.com', phone: '' },
  setTheme: vi.fn(), update: vi.fn(), setUser: vi.fn(), cache: vi.fn(), updatePassword: vi.fn(),
  query: vi.fn(), setOrg: vi.fn(),
}));
vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: mocks.user, setUser: mocks.setUser }),
  useOrgStore: () => ({ setCurrency: mocks.setOrg, setOrganizationName: mocks.setOrg, setOrganizationAddress: mocks.setOrg, setOrganizationPhone: mocks.setOrg }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: mocks.setTheme }) }));
vi.mock('@/i18n', () => ({ SUPPORTED_LOCALES: [{code:'en',name:'English',native:'English'}], useI18n: () => ({ locale:'en',setLocale:vi.fn(),t: new Proxy({}, {get: () => new Proxy({}, {get: (_t,k) => String(k)})}) }) }));
vi.mock('@/lib/offline/db', () => ({ cacheUserSession: mocks.cache }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { updateUser: mocks.updatePassword }, from: () => ({
  update: mocks.update,
  select: () => ({ eq: () => ({single: async () => ({data:{name:'Shop'},error:null})}) }),
}) }) }));
vi.mock('@tanstack/react-query', () => ({useQuery: mocks.query}));
vi.mock('@/hooks/use-realtime-sync', () => ({useRealtimeSync:vi.fn()}));
vi.mock('@/app/(dashboard)/admin/page', () => ({default: () => <h1>Platform overview</h1>}));
import Settings from '@/app/(dashboard)/settings/page';
import Dashboard from '@/app/(dashboard)/dashboard/page';
import { getBreadcrumbForPath, getFlatNavItems } from './nav-config';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  mocks.user.role='platform_owner'; mocks.user.organization_id=null;
  mocks.update.mockReturnValue({eq: () => ({select: () => ({single: async () => ({data:mocks.user,error:null})})})});
  mocks.updatePassword.mockResolvedValue({error:null});
  mocks.query.mockReturnValue({data:undefined,isLoading:true,refetch:vi.fn()});
});
async function mounted(Page: React.ComponentType, run: (host: HTMLDivElement, rerender: () => void) => Promise<void>) {
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try { await act(() => root.render(<Page />)); await run(host, () => root.render(<Page />)); }
  finally {await act(() => root.unmount());host.remove();}
}
async function tab(host: HTMLElement, label: string) {
  const button=Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]')).find(b=>b.textContent===label)!;
  await act(() => {button.focus();button.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));});
}
async function input(host: HTMLElement,id:string,value:string) {
  await act(() => {const el=host.querySelector<HTMLInputElement>('#'+id)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
}
it.each([375,1280])('keeps platform settings role-specific and working at %ipx',async width=>{
  Object.defineProperty(window,'innerWidth',{configurable:true,value:width});
  await mounted(Settings,async host=>{
    expect(host.querySelector('h1')?.className).toContain('tt-page-title');
    expect(host.textContent).not.toContain('tab_business');
    await input(host,'full_name','Xavier Updated');
    await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='save_changes')!.click());
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({full_name:'Xavier Updated'}));
    expect(mocks.cache).toHaveBeenCalled();
    await tab(host,'tab_display');
    const dark=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('theme_dark'))!;
    await act(()=>dark.click());expect(mocks.setTheme).toHaveBeenCalledWith('dark');
    await tab(host,'tab_security');
    await input(host,'newPassword','secure-test-password');await input(host,'confirmPassword','secure-test-password');
    await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='change_password')!.click());
    expect(mocks.updatePassword).toHaveBeenCalledWith({password:'secure-test-password'});
  });
});
it('preserves business settings for merchants and resets the panel on role change',async()=>{
  mocks.user.role='business_owner';mocks.user.organization_id='org';
  await mounted(Settings,async(host,rerender)=>{
    await tab(host,'tab_business');expect(host.querySelector('#org_name')).not.toBeNull();
    mocks.user.role='platform_owner';mocks.user.organization_id=null;
    await act(rerender);expect(host.querySelector('#org_name')).toBeNull();expect(host.querySelector('#full_name')).not.toBeNull();
  });
});
it('never mounts merchant dashboard queries for platform owners and preserves merchant routing',async()=>{
  await mounted(Dashboard,async(host,rerender)=>{
    expect(host.textContent).toBe('Platform overview');expect(mocks.query).not.toHaveBeenCalled();
    mocks.user.role='business_owner';await act(rerender);
    expect(mocks.query).toHaveBeenCalled();expect(host.querySelector('a[href="/pos"]')).not.toBeNull();
  });
  expect(getFlatNavItems('platform_owner').some(item=>item.href==='/pos')).toBe(false);
  expect(getBreadcrumbForPath('/dashboard','platform_owner',{})).toEqual({breadcrumb:['Platform'],title:'Platform overview'});
});
