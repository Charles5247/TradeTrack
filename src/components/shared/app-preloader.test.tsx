// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AppPreloader } from './app-preloader';

afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();sessionStorage.clear();});
it.each([375,1280])('auto-dismisses without video or skip controls at %ipx',async width=>{
 vi.useFakeTimers();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.spyOn(document,'readyState','get').mockReturnValue('loading');
 Object.defineProperty(window,'innerWidth',{value:width,configurable:true});
 const host=document.createElement('div');const root=createRoot(host);
 await act(()=>root.render(<AppPreloader/>));
 expect(host.querySelector('[role=status]')).not.toBeNull();
 expect(host.querySelector('video,button')).toBeNull();
 await act(()=>{window.dispatchEvent(new Event('load'));vi.advanceTimersByTime(850);});
 expect(host.innerHTML).toBe('');await act(()=>root.unmount());
});
it('releases a stalled offline startup without waiting for load',async()=>{
 vi.useFakeTimers();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.spyOn(document,'readyState','get').mockReturnValue('loading');
 vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
 const host=document.createElement('div');const root=createRoot(host);
 await act(()=>root.render(<AppPreloader/>));
 await act(()=>vi.advanceTimersByTime(4250));
 expect(host.innerHTML).toBe('');await act(()=>root.unmount());
});
