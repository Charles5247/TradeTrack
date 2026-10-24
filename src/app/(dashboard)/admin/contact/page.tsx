import { createClient } from '@/lib/supabase/server';
import { TranslatedText } from '@/i18n/text';
import Link from 'next/link';

type Message = {id:string;name:string;business_name:string;phone:string;message:string;created_at:string;email_status:string};
export default async function ContactInbox() {
  const db=await createClient();
  if(!db)return <p><TranslatedText text="Please try again." /></p>;
  const {data:{user}}=await db.auth.getUser();
  const {data:profile}=user ? await db.from('users').select('role').eq('id',user.id).single() : {data:null};
  if(profile?.role!=='platform_owner')return <p><TranslatedText text="Access denied" /></p>;
  const {data,error}=await db.from('contact_messages' as never).select('*').order('created_at',{ascending:false}).limit(100);
  return <section className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8"><h1 className="text-3xl font-semibold"><TranslatedText text="Contact messages" /></h1>
    <Link href="/reviews" className="inline-block underline"><TranslatedText text="Merchant reviews" /></Link>
    {error ? <p role="alert"><TranslatedText text="Please try again." /></p> : !(data?.length) ? <p><TranslatedText text="No messages yet." /></p> :
    (data as unknown as Message[]).map(message=><article key={message.id} className="space-y-3 rounded-xl border border-border p-5">
      <h2 className="font-semibold">{message.name} · {message.business_name}</h2>
      <a className="underline" href={`tel:${message.phone.replace(/[^+0-9]/g,'')}`}>{message.phone}</a>
      <p className="whitespace-pre-wrap break-words">{message.message}</p>
      <time className="text-sm text-muted-foreground" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos'})}</time>
    </article>)}
  </section>;
}
