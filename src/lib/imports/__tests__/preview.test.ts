import { expect, it } from 'vitest';
import { autoMap, mapRows, previewImport, validateRow } from '../preview';
it('maps common spreadsheet headers', () => {
 const map=autoMap(['Product Name','SKU','Qty','Price'],'products');
 expect(map.name).toBe('Product Name');expect(map.opening_stock).toBe('Qty');
 expect(mapRows([{ 'Product Name':'Rice',SKU:'R',Qty:3,Price:10 }],map)[0].name).toBe('Rice');
});
it('reports malformed money, stock, email and privileged roles', () => {
 expect(validateRow({name:'A',sku:'S',selling_price:-1,opening_stock:0.5},'products').length).toBeGreaterThan(0);
 expect(validateRow({name:'B',email:'bad',role:'business_owner'},'staff_invites')).toHaveLength(2);
});
it('matches SKU/barcode and refuses ambiguous identities', () => {
 const rows=[{name:'Rice',sku:'R',barcode:'B',opening_stock:0}];
 expect(previewImport(rows,'products','skip',[{id:'old',sku:'R'}])[0].outcome).toBe('skip');
 expect(previewImport(rows,'products','update',[{id:'old',barcode:'B'}])[0].id).toBe('old');
 expect(previewImport(rows,'products','update',[{id:'old',sku:'R'},{id:'other',barcode:'B'}])[0].outcome).toBe('error');
});
it('validates all rows and disallows duplicate SKUs and stock replacement', () => {
 const row={name:'Rice',sku:'R',selling_price:'1,000',opening_stock:5};
 expect(previewImport([row],'products','create',[])[0].data.selling_price).toBe('1000');
 expect(previewImport([row,row],'products','skip',[])[1].outcome).toBe('error');
 expect(previewImport([row],'products','update',[{id:'old',sku:'R'}])[0].outcome).toBe('error');
 expect(previewImport([row],'products','create',[{id:'old',sku:'R'}])[0].outcome).toBe('error');
});
