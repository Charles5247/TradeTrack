import {expect,it} from 'vitest';
import {industryProfile,isIndustry,productVariantLabel,STOCK_UNITS} from './industries';
import {industryCopy} from '@/i18n/industry-copy';
import {INDUSTRIES} from './industries';
it('keeps sector units appropriate without enabling medicine tools for ordinary merchants',()=>{
 expect(isIndustry('warehousing')).toBe(true);
 expect(industryProfile('electronics').model).toBe(true);
 expect(industryProfile('electronics').units).not.toContain('tablet');
 expect(industryProfile('fashion').units).toContain('pair');
 expect(industryProfile('fashion').variant).toBe(true);
 expect(industryProfile('grocery').units).toEqual(expect.arrayContaining(['g','kg','mL','L']));
});
it('distinguishes otherwise identical variants at checkout',()=>{
 expect(productVariantLabel({name:'Shoe',variant_size:'42',variant_colour:'Black'})).toBe('Shoe · 42 · Black');
 expect(productVariantLabel({name:'Phone',model:'128 GB'})).toBe('Phone · 128 GB');
});
it('covers every industry, unit and profile term in all app languages',()=>{
 const labels=[...INDUSTRIES.map(i=>i.label),...STOCK_UNITS,...INDUSTRIES.flatMap(i=>{const p=industryProfile(i.value);return [p.title,p.productLabel,p.example];})];
 for(const label of labels)for(const locale of ['ha','yo','ig','pcm'] as const)expect(industryCopy[label]?.[locale],`${label}:${locale}`).toBeTruthy();
 for(const [source,copy] of Object.entries(industryCopy))for(const value of Object.values(copy))expect([...value.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort()).toEqual([...source.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort());
});
