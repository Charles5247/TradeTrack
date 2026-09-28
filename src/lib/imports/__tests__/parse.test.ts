import { expect, it } from 'vitest';
import { parseImportFile } from '../parse';
import * as XLSX from 'xlsx';
it('parses quoted CSV and Excel workbooks with the existing parser',async()=>{
 const csv=new File(['Name,SKU,Price\n"Rice, bag",RICE,100\n'],'products.csv');
 expect((await parseImportFile(csv))[0]).toMatchObject({Name:'Rice, bag',SKU:'RICE',Price:100});
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{Name:'Beans',Qty:5}]),'Products');
 const file=new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'products.xlsx');
 expect((await parseImportFile(file))[0]).toEqual({Name:'Beans',Qty:5});
});
it('rejects unsupported file types',async()=>{
 await expect(parseImportFile(new File(['data'],'script.js'))).rejects.toThrow('CSV or XLSX');
});
