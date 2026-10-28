import { describe, expect, it } from 'vitest';
import { checkoutUrl, matchesCheckout } from './zainpay-checkout';
const checkout={reference:'TT-test',amount_kobo:6000000,mode:'live',zainbox_code:'merchant-box',status:'pending'};
const valid={code:'00',data:{txnRef:'TT-test',depositedAmount:'6000000',amountAfterCharges:'5990000',zainboxCode:'merchant-box',txnType:'deposit'}};
describe('Zainpay verification boundary',()=>{
 it('matches gross kobo amount and exact reference and destination',()=>expect(matchesCheckout(valid,checkout)).toBe(true));
 it.each([{depositedAmount:'60000'},{depositedAmount:'6000000.00'},{txnRef:'other'},{zainboxCode:'other'},{txnType:'transfer'},{depositedAmount:undefined}])('rejects mismatched payment %j',changes=>expect(matchesCheckout({...valid,data:{...valid.data,...changes}},checkout)).toBe(false));
 it('does not activate on a status label alone',()=>expect(matchesCheckout({code:'01',data:valid.data},checkout)).toBe(false));
 it('supports documented string URLs and legacy object URLs',()=>{
  expect(checkoutUrl({code:'00',data:'https://pay.zainpay.ng/test'})).toBe('https://pay.zainpay.ng/test');
  expect(checkoutUrl({code:'00',data:{paymentUrl:'https://pay.zainpay.ng/test'}})).toBe('https://pay.zainpay.ng/test');
  expect(checkoutUrl({code:'00',data:'javascript:alert(1)'})).toBeNull();
 });
});
