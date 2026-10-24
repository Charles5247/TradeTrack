'use client';
import Link from 'next/link';
import { useOrganization } from './organization-provider';
import { useAuthStore } from '@/store';
import { industryProfile } from '@/lib/industries';
import { useCopy } from '@/i18n/text';
export function IndustryWorkspace(){
 const {industry}=useOrganization();const {user}=useAuthStore();const copy=useCopy();const profile=industryProfile(industry);
 if(!industry||!user||!['business_owner','admin'].includes(user.role))return null;
 return <section className="space-y-3 rounded-xl border border-border bg-card p-5">
  <h2 className="text-xl font-semibold">{copy(profile.title)}</h2>
  <p className="text-sm text-muted-foreground">{copy('Set up your locations, add products and receive opening stock before your first sale.')}</p>
  <p className="text-sm">{copy('Selling units')}: {profile.units.map(unit=>copy(unit)).join(' · ')}</p>
  <div className="flex flex-wrap gap-4">{[['/warehouses',profile.locationLabel],['/products','Products'],['/inventory','Inventory'],['/pos','Point of Sale']].map(([href,label])=><Link key={href} href={href} className="inline-flex min-h-11 items-center font-semibold text-primary underline">{copy(label)}</Link>)}</div>
 </section>;
}
