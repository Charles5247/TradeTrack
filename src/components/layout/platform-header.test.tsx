// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({role:'platform_owner',sync:vi.fn(),open:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()}),usePathname:()=>'/dashboard'}));
vi.mock('next-themes',()=>({useTheme:()=>({theme:'light',setTheme:vi.fn()})}));
vi.mock('@/lib/offline/sync-engine',()=>({syncEngine:{sync:state.sync}}));
vi.mock('@/lib/offline/db',()=>({clearCachedSession:vi.fn()}));
vi.mock('@/lib/utils/network',()=>({requireOnline:()=>true}));
vi.mock('@/hooks/use-online-status',()=>({useOnlineStatus:()=>true}));
vi.mock('@/store',()=>({
  useAuthStore:()=>({user:{role:state.role,full_name:'Xavier'},setUser:vi.fn()}),
  useUIStore:()=>({toggleSidebar:vi.fn(),setCommandPaletteOpen:state.open}),
  useNotificationStore:()=>({unreadCount:0}),useSyncStore:()=>({syncStatus:'synced',pendingCount:2}),
}));
vi.mock('@/i18n',()=>({useI18n:()=>({t:{nav:{},header:new Proxy({},{get:(_t,k)=>String(k)})}})}));
import {Header} from './header';
it('hides merchant upload actions for platform owners while preserving merchant sync and navigation search',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {
    await act(()=>root.render(<Header />));
    expect(host.querySelector('[aria-label="Upload pending data"]')).toBeNull();
    expect(host.textContent).toContain('Platform overview');
    await act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Open search"]')!.click());
    expect(state.open).toHaveBeenCalledWith(true);
    state.role='business_owner';await act(()=>root.render(<Header />));
    await act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Upload pending data"]')!.click());
    expect(state.sync).toHaveBeenCalledWith(true);
  }finally{await act(()=>root.unmount());host.remove();}
});
