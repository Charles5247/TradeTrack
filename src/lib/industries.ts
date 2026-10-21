export const INDUSTRIES = [
  { value: 'retail', label: 'General retail' },
  { value: 'warehousing', label: 'Warehouse merchant' },
  { value: 'pharmacy', label: 'Pharmacy / medical store' },
  { value: 'medical_wholesale', label: 'Medical wholesaler / dealer' },
  { value: 'medical_manufacturing', label: 'Medical manufacturing / storage' },
  { value: 'hospital', label: 'Hospital / clinic' },
  { value: 'electronics', label: 'Technology / electronics' },
  { value: 'fashion', label: 'Fabric / clothing / footwear' },
  { value: 'grocery', label: 'Grocery / provisions' },
  { value: 'wholesale', label: 'Wholesale / FMCG' },
  { value: 'manufacturing', label: 'General manufacturing' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'services', label: 'Services' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'other', label: 'Other' },
] as const;

export function isIndustry(value: unknown): value is typeof INDUSTRIES[number]['value'] {
  return typeof value === 'string' && INDUSTRIES.some(industry => industry.value === value);
}

export function isMedicalIndustry(value: unknown): boolean {
  return typeof value === 'string' && ['pharmacy', 'medical_store', 'medical_wholesale', 'medical_manufacturing', 'hospital'].includes(value);
}

export const STOCK_UNITS = ['piece','pair','pack','carton','bag','g','kg','mL','L','cm','m','tablet','bottle','vial'] as const;
export type StockUnit = typeof STOCK_UNITS[number];
export function industryProfile(industry: unknown) {
  const base = {title:'Retail workspace',productLabel:'Product name',example:'Product name and pack size',units:['piece','pack','carton','bag'] as readonly StockUnit[],variant:false,model:false,locationLabel:'Storage locations'};
  if (industry === 'electronics') return {...base,title:'Technology and gadgets',productLabel:'Device / accessory name',example:'Phone model, storage capacity and colour',model:true};
  if (industry === 'fashion') return {...base,title:'Clothing and footwear',productLabel:'Style / item name',example:'Style, size and colour',units:['piece','pair','pack','cm','m'] as readonly StockUnit[],variant:true};
  if (industry === 'grocery') return {...base,title:'Grocery workspace',units:['piece','pack','carton','bag','g','kg','mL','L'] as readonly StockUnit[]};
  if (industry === 'wholesale') return {...base,title:'Wholesale / FMCG',units:['piece','pack','carton','bag','g','kg','mL','L'] as readonly StockUnit[]};
  if (industry === 'warehousing') return {...base,title:'Warehouse merchant',locationLabel:'Warehouses',units:STOCK_UNITS.filter(unit=>!['tablet','vial'].includes(unit))};
  if (isMedicalIndustry(industry)) return {...base,title:'Medical inventory',productLabel:'Medicine / product name',units:['piece','pack','tablet','bottle','vial','g','mL'] as readonly StockUnit[]};
  return base;
}

export function productVariantLabel(product: {name:string;variant_size?:string|null;variant_colour?:string|null;model?:string|null}) {
  return [product.name,product.model,product.variant_size,product.variant_colour].filter(Boolean).join(' · ');
}
