import {expect,it} from 'vitest';
import {roundMoney} from './money';
it.each([[1.005,1.01],[2.675,2.68],[0.1+0.2,0.3],[10*0.333,3.33]])('preserves currency precision for %s', (input,expected)=>{expect(roundMoney(input)).toBe(expected);});
it.each([NaN,Infinity,-Infinity,10000000000])('rejects unavailable or out-of-range amounts: %s',value=>{expect(()=>roundMoney(value)).toThrow('currency');});
