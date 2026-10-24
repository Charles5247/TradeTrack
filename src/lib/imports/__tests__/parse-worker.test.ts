import {afterEach,expect,it,vi} from 'vitest';
import {parseImportFile} from '../parse';
class FakeWorker {
 static instances:FakeWorker[]=[];
 onmessage:((event:MessageEvent)=>void)|null=null;
 onerror:(()=>void)|null=null;
 terminate=vi.fn();postMessage=vi.fn();
 constructor(){FakeWorker.instances.push(this);}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();FakeWorker.instances=[];});
it('terminates a failed worker and rejects without preparing partial rows',async()=>{
 vi.stubGlobal('Worker',FakeWorker);
 const result=parseImportFile(new File(['Name,Qty\nRice,1'],'stock.csv'));
 await vi.waitFor(()=>expect(FakeWorker.instances).toHaveLength(1));
 const worker=FakeWorker.instances[0];const rejected=expect(result).rejects.toThrow('processing failed');
 worker.onerror!();await rejected;expect(worker.terminate).toHaveBeenCalledTimes(1);
});
it('bounds a stalled parser worker and discards late output',async()=>{
 vi.useFakeTimers();vi.stubGlobal('Worker',FakeWorker);
 const result=parseImportFile(new File(['Name,Qty\nRice,1'],'stock.csv'));
 await vi.waitFor(()=>expect(FakeWorker.instances).toHaveLength(1));
 const rejected=expect(result).rejects.toThrow('timed out');
 await vi.advanceTimersByTimeAsync(45000);await rejected;
 expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
});
