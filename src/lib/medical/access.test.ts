import { beforeEach, expect, it, vi } from 'vitest';
import { medicalAccess } from './access';

const mocks=vi.hoisted(()=>({
  user: {id:'staff'} as {id:string}|null,
  profile: {organization_id:'org',role:'cashier',status:'active'},
  industry: 'pharmacy' as string|null,
  filters: [] as Array<[string,string,unknown]>,
}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({
  auth:{getUser:async()=>({data:{user:mocks.user},error:null})},
  from:(table:string)=>({select:()=>({eq:(column:string,value:unknown)=>{
    mocks.filters.push([table,column,value]);
    return {single:async()=>({data:mocks.profile}),maybeSingle:async()=>({data:{business_type:mocks.industry}})};
  }})}),
})}));
beforeEach(()=>{
  mocks.user={id:'staff'};mocks.profile={organization_id:'org',role:'cashier',status:'active'};mocks.industry='pharmacy';mocks.filters=[];
});
it('resolves medical access using the authenticated user and their own organization',async()=>{
  expect((await medicalAccess()).status).toBe(200);
  expect(mocks.filters).toEqual([['users','id','staff'],['merchants','organization_id','org']]);
});
it.each(['electronics','fashion','retail',null])('denies medical access for %s',async industry=>{
  mocks.industry=industry;
  expect(await medicalAccess()).toEqual({client:null,status:403});
});
it('requires authentication',async()=>{
  mocks.user=null;expect(await medicalAccess()).toEqual({client:null,status:401});
  expect(mocks.filters).toHaveLength(0);
});
it('denies suspended users even in a pharmacy',async()=>{
  mocks.profile.status='suspended';expect(await medicalAccess()).toEqual({client:null,status:403});
});
