export const INDUSTRIES = [
  { value: 'retail', label: 'General retail' },
  { value: 'pharmacy', label: 'Pharmacy / medical store' },
  { value: 'medical_wholesale', label: 'Medical wholesaler / dealer' },
  { value: 'medical_manufacturing', label: 'Medical manufacturing / storage' },
  { value: 'hospital', label: 'Hospital / clinic' },
  { value: 'electronics', label: 'Technology / electronics' },
  { value: 'fashion', label: 'Fabric / clothing / footwear' },
  { value: 'grocery', label: 'Grocery / provisions' },
  { value: 'wholesale', label: 'General wholesale' },
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
