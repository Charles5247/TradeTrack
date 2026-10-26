import { expect,it } from 'vitest';
import {storageErrorStatus} from './storage-errors';
it.each([
 [{status:400,statusCode:'404'},404],
 [{status:400,statusCode:'429'},429],
 [{status:403,statusCode:'AccessDenied'},403],
 [{status:503},503],
 [null,0],
])('uses the provider storage status for %j', (error,status)=>expect(storageErrorStatus(error)).toBe(status));
