import { beforeEach } from 'vitest';
import { getDB } from '../db';
beforeEach(async()=>{
 const db=await getDB();const now=Date.now();
 for(const org of ['org','org-1']) await db.put('app_meta',{id:`subscription:${org}`,active:true,verifiedAt:now,lastSeen:now});
});
