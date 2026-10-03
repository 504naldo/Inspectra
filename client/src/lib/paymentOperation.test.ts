import { expect, it, vi } from 'vitest';
import { PaymentOperation } from './paymentOperation';
function storage() { const values = new Map<string,string>(); return { getItem: (k:string)=>values.get(k)??null, setItem:(k:string,v:string)=>{values.set(k,v)}, removeItem:(k:string)=>{values.delete(k)} }; }
it('retains identity and exact partial payment after lost response, navigation and reopening', async () => {
 const disk=storage(), first=new PaymentOperation('account:company:invoice',disk), input={id:1,amountPaid:40,paidAt:'2026-10-03'};
 let committed:any;
 await expect(first.submit(input,async p=>{committed=p;throw Error('lost response')})).rejects.toThrow();
 const reopened=new PaymentOperation('account:company:invoice',disk);
 expect(reopened.pending()).toEqual(committed);
 await expect(reopened.submit({...input,amountPaid:60},vi.fn())).rejects.toThrow(/Reconcile/);
 const lookup=vi.fn(async p=>p.requestId===committed.requestId?{amountPaid:40}:null);
 expect(await reopened.reconcile(lookup)).toEqual({amountPaid:40});
 expect(reopened.pending()?.requestId).toBe(committed.requestId);
 await reopened.beginNext(lookup); expect(reopened.pending()).toBeNull();
});
it('coalesces repeated clicks, persists before sending, and retries the same identity if receipt absent',async()=>{
 const disk=storage(), op=new PaymentOperation('a',disk), input={id:2,amountPaid:25};
 let finish!:(x:any)=>void;const send=vi.fn(p=>new Promise(resolve=>{expect(op.pending()).toEqual(p);finish=resolve}));
 const first=op.submit(input,send), second=op.submit(input,send);await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(1));finish({success:true});await Promise.all([first,second]);await op.beginNext(async()=>({success:true}));
 await expect(op.submit(input,async()=>{throw Error('offline')})).rejects.toThrow();const id=op.pending()!.requestId;
 expect(await new PaymentOperation('a',disk).reconcile(async()=>null)).toBeNull();
 await op.submit(input,async p=>{expect(p.requestId).toBe(id);return {success:true}});
});
it('storage failure prevents dispatch and accounts cannot read each others operation',async()=>{
 const disk=storage(), send=vi.fn();const broken=new PaymentOperation('a',{...disk,setItem(){throw Error('quota')}});
 await expect(broken.submit({id:1,amountPaid:1},send)).rejects.toThrow('quota');expect(send).not.toHaveBeenCalled();
 await expect(new PaymentOperation('a',disk).submit({id:1,amountPaid:1},async()=>{throw Error()})).rejects.toThrow();expect(new PaymentOperation('b',disk).pending()).toBeNull();
});

it('a delayed old receipt never deletes a newer operation persisted by another instance', async()=>{
 const disk=storage(), first=new PaymentOperation('a',disk), input={id:1,amountPaid:40};
 await expect(first.submit(input,async()=>{throw Error('lost')})).rejects.toThrow();
 let resolve!:(v:any)=>void;const lookup=first.reconcile(()=>new Promise(r=>{resolve=r}));
 await Promise.resolve();
 const newer={id:1,amountPaid:60,requestId:crypto.randomUUID()};disk.setItem('a',JSON.stringify(newer));resolve({amountPaid:40});await lookup;
 expect(new PaymentOperation('a',disk).pending()).toEqual(newer);
});
it('corrupt records remain intact and block sends',async()=>{
 const disk=storage();disk.setItem('a','bad-json');const op=new PaymentOperation('a',disk),send=vi.fn();
 await expect(op.reconcile(async()=>null)).rejects.toThrow();await expect(op.submit({id:1,amountPaid:1},send)).rejects.toThrow();expect(send).not.toHaveBeenCalled();expect(disk.getItem('a')).toBe('bad-json');
});

it('concurrent instances retain the same acknowledged identity until an explicit reconciled next payment',async()=>{
 const disk=storage(), a=new PaymentOperation('shared',disk), b=new PaymentOperation('shared',disk), sent:string[]=[];
 let tail=Promise.resolve();vi.stubGlobal('navigator',{locks:{request:(_key:string,fn:()=>Promise<any>)=>{const result=tail.then(fn);tail=result.catch(()=>{});return result}}});
 try {await Promise.all([a.submit({id:1,amountPaid:40},async p=>{sent.push(p.requestId);return {amountPaid:40}}),b.submit({id:1,amountPaid:40},async p=>{sent.push(p.requestId);return {amountPaid:40}})]);expect(new Set(sent).size).toBe(1);
 await expect(a.beginNext(async()=>null)).rejects.toThrow(/reconciled/);
 await a.beginNext(async()=>({amountPaid:40}));await a.submit({id:1,amountPaid:60},async p=>{sent.push(p.requestId);return {amountPaid:100}});expect(new Set(sent).size).toBe(2);
 }finally{vi.unstubAllGlobals()}
});
it('waits for a strict durable commit before dispatch and restores the ID after volatile cache loss',async()=>{
 const disk=storage(), durable=storage();let commit!:(v:void)=>void;
 const journal={getItem:async(k:string)=>durable.getItem(k),removeItem:async(k:string)=>durable.removeItem(k),setItem:async(k:string,v:string)=>{await new Promise<void>(r=>{commit=r});durable.setItem(k,v)}};
 const op=new PaymentOperation('a',disk,journal),send=vi.fn(async()=>{throw Error('lost response')});const result=op.submit({id:1,amountPaid:40},send);
 await Promise.resolve();await Promise.resolve();expect(send).not.toHaveBeenCalled();commit();await expect(result).rejects.toThrow();const id=op.pending()!.requestId;disk.removeItem('a');
 const reopened=new PaymentOperation('a',disk,{...journal,setItem:async(k,v)=>durable.setItem(k,v)});await reopened.restore();expect(reopened.pending()?.requestId).toBe(id);expect(await reopened.reconcile(async()=>({amountPaid:40}))).toEqual({amountPaid:40});
});
it('durable-journal failure blocks network dispatch and preserves legacy operation identity',async()=>{
 const disk=storage(),send=vi.fn(),saved={id:1,requestId:crypto.randomUUID(),amountPaid:40};disk.setItem('a',JSON.stringify(saved));
 const journal={getItem:async()=>null,removeItem:async()=>{},setItem:async()=>{throw Error('disk unavailable')}};
 await expect(new PaymentOperation('a',disk,journal).submit(saved,send)).rejects.toThrow('disk unavailable');expect(send).not.toHaveBeenCalled();expect(JSON.parse(disk.getItem('a')!)).toEqual(saved);
});
