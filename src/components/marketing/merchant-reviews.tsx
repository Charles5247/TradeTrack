'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useCopy } from '@/i18n/text';

type Review = { id:string; author_id:string|null; merchant_name:string; business_name:string; location:string; review:string; rating:number|null; deleted_at:string|null };
export function MerchantReviews({ editable=false }: { editable?:boolean }) {
  const copy=useCopy();
  const [rows,setRows]=useState<Review[]>([]);
  const [userId,setUserId]=useState<string|null>(null);
  const [owner,setOwner]=useState(false);
  const [merchant,setMerchant]=useState(false);
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({merchant_name:'',business_name:'',location:'',review:'',rating:''});
  const db=createClient();
  async function load() {
    try {
    const {data,error}=await db.from('merchant_reviews' as never).select('*').order('created_at',{ascending:false});
    if(error) setStatus('Reviews are temporarily unavailable. Please try again.');
    else setRows((data??[]) as unknown as Review[]);
    } catch { setStatus('Reviews are temporarily unavailable. Please try again.'); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void load(); if(!editable)return;
    void (async()=>{
      const {data:{user}}=await db.auth.getUser(); if(!user)return; setUserId(user.id);
      const {data:profile}=await db.from('users').select('full_name,role,organization_id').eq('id',user.id).single();
      setOwner(profile?.role==='platform_owner');setMerchant(profile?.role==='business_owner');
      const {data:existing}=await db.from('merchant_reviews' as never).select('*').eq('author_id',user.id).maybeSingle();
      if(existing){const r=existing as unknown as Review;setForm({merchant_name:r.merchant_name,business_name:r.business_name,location:r.location,review:r.review,rating:r.rating ? String(r.rating):''});return;}
      const {data:org}=profile?.organization_id ? await db.from('organizations').select('name,address').eq('id',profile.organization_id).single() : {data:null};
      setForm(f=>({...f,merchant_name:profile?.full_name??'',business_name:org?.name??'',location:org?.address??''}));
    })().catch(()=>setStatus('Reviews are temporarily unavailable. Please try again.'));
  // The Supabase browser client is a singleton.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[editable]);
  async function save(event:React.FormEvent) {
    event.preventDefault();if(!userId)return;
    if(!navigator.onLine){setStatus('You are offline. Save a draft and send it when connected.');return;}
    setBusy(true);
    try {
    const payload={...form,rating:form.rating?Number(form.rating):null,author_id:owner?null:userId,admin_added:owner,updated_at:new Date().toISOString()};
    const query=db.from('merchant_reviews' as never) as any;
    const {error}=owner ? await query.insert(payload) : await query.upsert(payload,{onConflict:'author_id'});
    setStatus(error?'Could not save your review. Please try again.':'Your review has been saved.');
    if(!error){localStorage.removeItem('track:review-draft');await load();}
    } catch { setStatus('Could not save your review. Please try again.'); }
    finally { setBusy(false); }
  }
  async function moderate(row:Review){
    try {
    const {error}=await (db.from('merchant_reviews' as never) as any).update({deleted_at:row.deleted_at?null:new Date().toISOString()}).eq('id',row.id);
    if(error)setStatus('Could not save your review. Please try again.');else await load();
    } catch { setStatus('Could not save your review. Please try again.'); }
  }
  return <div className="space-y-8">
    <p role="status">{copy(loading?'Loading…':status)}</p>
    {!loading&&!status&&!rows.filter(r=>!r.deleted_at).length&&<p>{copy('No reviews yet. Share your experience with TracKasuwa.')}</p>}
    <div className="grid gap-5 md:grid-cols-2">{rows.filter(r=>owner||!r.deleted_at).map(r=><article key={r.id} className="rounded-2xl border border-border p-6">
      {r.rating&&<p aria-label={`${r.rating}/5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</p>}
      <p className="mt-3 whitespace-pre-wrap break-words">{r.review}</p><p className="mt-5 font-semibold">{r.merchant_name}</p><p className="text-sm">{r.business_name} · {r.location}</p>
      {owner&&<button className="mt-4 underline" onClick={()=>void moderate(r)}>{copy(r.deleted_at?'Restore review':'Hide review')}</button>}
    </article>)}</div>
    {!editable&&<Link href="/reviews" className="inline-block underline">{copy('Read and write reviews')}</Link>}
    {editable&&!userId&&<Link href="/login" className="inline-block underline">{copy('Sign in to write a review')}</Link>}
    {editable&&(merchant||owner)&&<form onSubmit={save} className="max-w-xl space-y-4 rounded-2xl border border-border p-6">
      <h2 className="text-2xl font-semibold">{copy(owner?'Add a real merchant review':'Your review')}</h2>
      {(['merchant_name','business_name','location'] as const).map((key,i)=><label key={key} className="block">{copy(['Your name','Business name','Location'][i])}<input required minLength={2} maxLength={key==='merchant_name'?150:200} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>)}
      <label className="block">{copy('Your review')}<textarea required minLength={5} maxLength={3000} rows={5} value={form.review} onChange={e=>setForm({...form,review:e.target.value})} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
      <label className="block">{copy('Rating (optional)')}<select value={form.rating} onChange={e=>setForm({...form,rating:e.target.value})} className="ml-3 rounded border border-border bg-background p-2"><option value="">—</option>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label>
      <button disabled={busy} className="rounded-lg bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50">{copy('Save review')}</button>
      <button type="button" className="ml-3 underline" onClick={()=>{localStorage.setItem('track:review-draft',JSON.stringify(form));setStatus('Draft saved on this device.');}}>{copy('Save draft on this device')}</button>
      <button type="button" className="block underline" onClick={()=>{try{const raw=localStorage.getItem('track:review-draft');if(raw)setForm(JSON.parse(raw));}catch{setStatus('Please check the form fields.');}}}>{copy('Restore draft')}</button>
    </form>}
  </div>;
}
