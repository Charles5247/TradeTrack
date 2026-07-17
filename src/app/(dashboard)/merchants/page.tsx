'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Clock,
  Ban,
  Trash2,
  Edit,
  Eye,
  RefreshCw,
  ChevronRight,
  Smartphone,
  Mail,
  Phone,
  MapPin,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { useI18n } from '@/i18n';

const supabase = createClient();

// ─── Types ────────────────────────────────────────────────────────────────────
type MerchantStatus = 'pending' | 'active' | 'suspended' | 'deactivated';
type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

interface Merchant {
  id:                   string;
  organization_id:      string;
  business_name:        string;
  business_type:        string | null;
  registration_number:  string | null;
  tax_id:               string | null;
  status:               MerchantStatus;
  verification_status:  VerificationStatus;
  contact_name:         string;
  contact_email:        string;
  contact_phone:        string | null;
  address:              string | null;
  city:                 string | null;
  state:                string | null;
  country:              string;
  onboarding_completed: boolean;
  onboarding_step:      number;
  notes:                string | null;
  created_at:           string;
  updated_at:           string;
}

interface MerchantFormData {
  business_name:       string;
  business_type:       string;
  registration_number: string;
  tax_id:              string;
  contact_name:        string;
  contact_email:       string;
  contact_phone:       string;
  address:             string;
  city:                string;
  state:               string;
  country:             string;
  notes:               string;
}

interface DeviceLimits {
  id:             string;
  plan_type:      string;
  max_devices:    number;
  current_devices: number;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<MerchantStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:     { label: 'Pending',     color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: <Clock className="h-3 w-3" /> },
  active:      { label: 'Active',      color: 'bg-green-100 text-green-800 border-green-200',    icon: <CheckCircle className="h-3 w-3" /> },
  suspended:   { label: 'Suspended',   color: 'bg-red-100 text-red-800 border-red-200',          icon: <Ban className="h-3 w-3" /> },
  deactivated: { label: 'Deactivated', color: 'bg-gray-100 text-gray-800 border-gray-200',       icon: <XCircle className="h-3 w-3" /> },
};

const VERIFICATION_CONFIG: Record<VerificationStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  unverified: { label: 'Unverified', variant: 'outline' },
  pending:    { label: 'Pending',    variant: 'secondary' },
  verified:   { label: 'Verified',   variant: 'default' },
  rejected:   { label: 'Rejected',   variant: 'destructive' },
};

function MerchantStatusBadge({ status }: { status: MerchantStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Onboarding Steps ─────────────────────────────────────────────────────────
function getOnboardingSteps(t: ReturnType<typeof useI18n>['t']) {
  return [
    { step: 1, label: t.merchants.onboard_step_business_info,     icon: <Building2 className="h-4 w-4" /> },
    { step: 2, label: t.merchants.onboard_step_contact_address,   icon: <MapPin className="h-4 w-4" /> },
    { step: 3, label: t.merchants.onboard_step_doc_verification,  icon: <FileText className="h-4 w-4" /> },
    { step: 4, label: t.merchants.onboard_step_payment_setup,     icon: <CheckCircle className="h-4 w-4" /> },
    { step: 5, label: t.merchants.onboard_step_complete,          icon: <CheckCircle className="h-4 w-4" /> },
  ];
}

// ─── Create Merchant Dialog ───────────────────────────────────────────────────
interface CreateMerchantDialogProps {
  open:     boolean;
  onClose:  () => void;
  onSuccess: () => void;
  orgId:    string;
}

function CreateMerchantDialog({ open, onClose, onSuccess, orgId }: CreateMerchantDialogProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<MerchantFormData>({
    business_name: '', business_type: '', registration_number: '', tax_id: '',
    contact_name: '', contact_email: '', contact_phone: '',
    address: '', city: '', state: '', country: 'Nigeria', notes: '',
  });
  const [loading, setLoading] = useState(false);

  const updateForm = (field: keyof MerchantFormData, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  async function handleSubmit() {
    if (!form.business_name || !form.contact_name || !form.contact_email) {
      toast.error(t.merchants.name_email_required);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('merchants')
        .insert({
          organization_id:     orgId,
          business_name:       form.business_name,
          business_type:       form.business_type || null,
          registration_number: form.registration_number || null,
          tax_id:              form.tax_id || null,
          contact_name:        form.contact_name,
          contact_email:       form.contact_email,
          contact_phone:       form.contact_phone || null,
          address:             form.address || null,
          city:                form.city || null,
          state:               form.state || null,
          country:             form.country || 'Nigeria',
          notes:               form.notes || null,
          status:              'pending',
          verification_status: 'unverified',
          onboarding_completed: false,
          onboarding_step:     1,
        } as any);
      if (error) throw error;
      toast.success(t.merchants.created_success);
      onSuccess();
      onClose();
      setForm({
        business_name: '', business_type: '', registration_number: '', tax_id: '',
        contact_name: '', contact_email: '', contact_phone: '',
        address: '', city: '', state: '', country: 'Nigeria', notes: '',
      });
      setStep(1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.merchants.create_failed;
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {t.merchants.dialog_title}
          </DialogTitle>
          <DialogDescription>
            {t.merchants.dialog_desc}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-1 my-2">
          {[1, 2, 3].map(s => (
            <React.Fragment key={s}>
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition-colors ${
                  s < step ? 'bg-primary border-primary text-white' :
                  s === step ? 'border-primary text-primary' :
                  'border-muted text-muted-foreground'
                }`}
              >
                {s < step ? '✓' : s}
              </div>
              {s < 3 && <div className={`flex-1 h-0.5 ${s < step ? 'bg-primary' : 'bg-muted'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Business Information */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">{t.merchants.step1_title}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{t.merchants.business_name} *</Label>
                <Input
                  value={form.business_name}
                  onChange={e => updateForm('business_name', e.target.value)}
                  placeholder={t.merchants.business_name_placeholder}
                />
              </div>
              <div>
                <Label>{t.merchants.business_type}</Label>
                <Select value={form.business_type} onValueChange={v => updateForm('business_type', v)}>
                  <SelectTrigger><SelectValue placeholder={t.merchants.select_type_placeholder} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">{t.merchants.type_retail}</SelectItem>
                    <SelectItem value="wholesale">{t.merchants.type_wholesale}</SelectItem>
                    <SelectItem value="restaurant">{t.merchants.type_restaurant}</SelectItem>
                    <SelectItem value="services">{t.merchants.type_services}</SelectItem>
                    <SelectItem value="ecommerce">{t.merchants.type_ecommerce}</SelectItem>
                    <SelectItem value="other">{t.merchants.type_other}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t.merchants.registration_number}</Label>
                <Input
                  value={form.registration_number}
                  onChange={e => updateForm('registration_number', e.target.value)}
                  placeholder={t.merchants.registration_number_placeholder}
                />
              </div>
              <div>
                <Label>{t.merchants.tax_id}</Label>
                <Input
                  value={form.tax_id}
                  onChange={e => updateForm('tax_id', e.target.value)}
                  placeholder={t.merchants.tax_id_placeholder}
                />
              </div>
              <div>
                <Label>{t.merchants.country}</Label>
                <Select value={form.country} onValueChange={v => updateForm('country', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nigeria">Nigeria</SelectItem>
                    <SelectItem value="Ghana">Ghana</SelectItem>
                    <SelectItem value="Kenya">Kenya</SelectItem>
                    <SelectItem value="South Africa">South Africa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Contact & Address */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">{t.merchants.step2_title}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{t.merchants.contact_person_name} *</Label>
                <Input
                  value={form.contact_name}
                  onChange={e => updateForm('contact_name', e.target.value)}
                  placeholder={t.merchants.full_name_placeholder}
                />
              </div>
              <div>
                <Label>{t.merchants.contact_email_label} *</Label>
                <Input
                  type="email"
                  value={form.contact_email}
                  onChange={e => updateForm('contact_email', e.target.value)}
                  placeholder={t.merchants.contact_email_placeholder}
                />
              </div>
              <div>
                <Label>{t.merchants.contact_phone}</Label>
                <Input
                  value={form.contact_phone}
                  onChange={e => updateForm('contact_phone', e.target.value)}
                  placeholder={t.merchants.contact_phone_placeholder}
                />
              </div>
              <div className="col-span-2">
                <Label>{t.merchants.street_address}</Label>
                <Input
                  value={form.address}
                  onChange={e => updateForm('address', e.target.value)}
                  placeholder={t.merchants.address_placeholder}
                />
              </div>
              <div>
                <Label>{t.merchants.city}</Label>
                <Input
                  value={form.city}
                  onChange={e => updateForm('city', e.target.value)}
                  placeholder={t.merchants.city_placeholder}
                />
              </div>
              <div>
                <Label>{t.merchants.state}</Label>
                <Input
                  value={form.state}
                  onChange={e => updateForm('state', e.target.value)}
                  placeholder={t.merchants.state_placeholder}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Notes & Confirmation */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">{t.merchants.step3_title}</h3>
            <div className="p-4 bg-muted/50 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.merchants.business_label}</span>
                <span className="font-medium">{form.business_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.merchants.contact_label}</span>
                <span className="font-medium">{form.contact_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.merchants.email_label}</span>
                <span className="font-medium">{form.contact_email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.merchants.location_label}</span>
                <span className="font-medium">{[form.city, form.state, form.country].filter(Boolean).join(', ')}</span>
              </div>
            </div>
            <div>
              <Label>{t.merchants.internal_notes}</Label>
              <Textarea
                value={form.notes}
                onChange={e => updateForm('notes', e.target.value)}
                placeholder={t.merchants.notes_placeholder}
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)}>{t.merchants.back}</Button>
          )}
          {step < 3 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !form.business_name}
            >
              {t.merchants.next} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? t.merchants.creating : t.merchants.create_merchant}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── View Merchant Dialog ─────────────────────────────────────────────────────
interface ViewMerchantDialogProps {
  merchant:  Merchant | null;
  onClose:   () => void;
}

function ViewMerchantDialog({ merchant, onClose }: ViewMerchantDialogProps) {
  const { t } = useI18n();
  const [deviceLimits, setDeviceLimits] = useState<DeviceLimits | null>(null);
  const [editDevices, setEditDevices] = useState(false);
  const [newMaxDevices, setNewMaxDevices] = useState(1);
  const [savingDevices, setSavingDevices] = useState(false);

  React.useEffect(() => {
    if (merchant) {
      (supabase as any)
        .from('merchant_device_limits')
        .select('*')
        .eq('merchant_id', merchant.id)
        .single()
        .then(({ data }: { data: DeviceLimits | null }) => {
          if (data) {
            setDeviceLimits(data);
            setNewMaxDevices(data.max_devices);
          }
        });
    }
  }, [merchant]);

  async function saveDeviceLimits() {
    if (!merchant || !deviceLimits) return;
    setSavingDevices(true);
    try {
      const { error } = await (supabase as any)
        .from('merchant_device_limits')
        .update({ max_devices: newMaxDevices, plan_type: newMaxDevices <= 1 ? 'starter' : newMaxDevices <= 5 ? 'professional' : 'enterprise' })
        .eq('merchant_id', merchant.id);
      if (error) throw error;
      setDeviceLimits(prev => prev ? { ...prev, max_devices: newMaxDevices } : null);
      setEditDevices(false);
      toast.success(t.merchants.devices_updated);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t.merchants.devices_update_failed);
    } finally {
      setSavingDevices(false);
    }
  }

  if (!merchant) return null;

  return (
    <Dialog open={!!merchant} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {merchant.business_name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <MerchantStatusBadge status={merchant.status} />
            <Badge variant={VERIFICATION_CONFIG[merchant.verification_status].variant}>
              {VERIFICATION_CONFIG[merchant.verification_status].label}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Business Details */}
          <section>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t.merchants.business_details}</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detail label={t.merchants.business_type} value={merchant.business_type} />
              <Detail label={t.merchants.registration_number} value={merchant.registration_number} />
              <Detail label={t.merchants.tax_id} value={merchant.tax_id} />
              <Detail label={t.merchants.country} value={merchant.country} />
              <Detail label={t.merchants.registered} value={new Date(merchant.created_at).toLocaleDateString()} />
              <Detail label={t.inventory.last_updated} value={new Date(merchant.updated_at).toLocaleDateString()} />
            </div>
          </section>

          {/* Contact Information */}
          <section>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t.merchants.contact}</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{merchant.contact_name} — {merchant.contact_email}</span>
              </div>
              {merchant.contact_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{merchant.contact_phone}</span>
                </div>
              )}
              {(merchant.address || merchant.city) && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{[merchant.address, merchant.city, merchant.state].filter(Boolean).join(', ')}</span>
                </div>
              )}
            </div>
          </section>

          {/* Onboarding Progress */}
          <section>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t.merchants.onboarding_progress}</h4>
            <div className="space-y-2">
              {getOnboardingSteps(t).map(s => (
                <div key={s.step} className="flex items-center gap-3">
                  <div className={`p-1 rounded ${
                    merchant.onboarding_step > s.step ? 'bg-green-100 text-green-600' :
                    merchant.onboarding_step === s.step ? 'bg-primary/10 text-primary' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {s.icon}
                  </div>
                  <span className={`text-sm ${
                    merchant.onboarding_step > s.step ? 'text-green-600 line-through' :
                    merchant.onboarding_step === s.step ? 'font-semibold' :
                    'text-muted-foreground'
                  }`}>
                    {s.label}
                  </span>
                  {merchant.onboarding_step > s.step && (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-auto" />
                  )}
                  {merchant.onboarding_step === s.step && (
                    <Clock className="h-3.5 w-3.5 text-primary ml-auto" />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Device Limits */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t.merchants.device_limits}</h4>
              <Button variant="ghost" size="sm" onClick={() => setEditDevices(!editDevices)}>
                <Edit className="h-3.5 w-3.5 mr-1" /> {t.merchants.edit}
              </Button>
            </div>
            {deviceLimits ? (
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="h-4 w-4 text-primary" />
                  <span className="font-medium">{deviceLimits.plan_type} {t.merchants.plan_suffix}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-background rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${Math.min((deviceLimits.current_devices / deviceLimits.max_devices) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {deviceLimits.current_devices} / {deviceLimits.max_devices} {t.merchants.devices_suffix}
                  </span>
                </div>
                {editDevices && (
                  <div className="mt-3 flex items-center gap-2">
                    <Label className="text-xs">{t.merchants.max_devices_label}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={newMaxDevices}
                      onChange={e => setNewMaxDevices(Number(e.target.value))}
                      className="h-7 w-20 text-xs"
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={saveDeviceLimits} disabled={savingDevices}>
                      {savingDevices ? t.merchants.saving : t.merchants.save}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.merchants.no_device_limit}</p>
            )}
          </section>

          {/* Notes */}
          {merchant.notes && (
            <section>
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t.merchants.notes_header}</h4>
              <p className="text-sm bg-muted/50 p-3 rounded-lg">{merchant.notes}</p>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.merchants.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? '—'}</p>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
interface ConfirmDialogProps {
  open:      boolean;
  title:     string;
  message:   string;
  variant?:  'default' | 'destructive';
  onConfirm: () => void;
  onCancel:  () => void;
  loading?:  boolean;
}

function ConfirmDialog({ open, title, message, variant = 'default', onConfirm, onCancel, loading }: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {variant === 'destructive' && <AlertTriangle className="h-5 w-5 text-destructive" />}
            {title}
          </DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>{t.merchants.cancel}</Button>
          <Button variant={variant} onClick={onConfirm} disabled={loading}>
            {loading ? t.merchants.processing : t.merchants.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MerchantsPage() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMerchant, setViewMerchant] = useState<Merchant | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'activate' | 'suspend' | 'delete' | 'verify';
    merchant: Merchant;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const orgId = user?.organization_id ?? '';

  // ── Fetch merchants ───────────────────────────────────────────────────────
  const { data: merchants, isLoading } = useQuery({
    queryKey: ['merchants', orgId],
    queryFn: async (): Promise<Merchant[]> => {
      const query = supabase
        .from('merchants')
        .select('*')
        .order('created_at', { ascending: false });

      // Platform super_admin & org owners see all merchants; other roles see their org only
      if (user?.role !== 'super_admin' && user?.role !== 'owner') {
        query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('merchants fetch error:', error);
        return [];
      }
      return (data as any) as Merchant[];
    },
    enabled: !!orgId,
  });

  // ── Perform status action ─────────────────────────────────────────────────
  const performAction = useMutation({
    mutationFn: async ({ type, merchant }: { type: string; merchant: Merchant }) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (type === 'activate') {
        updates.status = 'active';
        updates.onboarding_step = 5;
        updates.onboarding_completed = true;
      } else if (type === 'suspend') {
        updates.status = 'suspended';
      } else if (type === 'verify') {
        updates.verification_status = 'verified';
      } else if (type === 'delete') {
        const { error } = await supabase.from('merchants').delete().eq('id', merchant.id);
        if (error) throw error;
        return;
      }

      if (type !== 'delete') {
        const { error } = await supabase
          .from('merchants')
          .update(updates as any)
          .eq('id', merchant.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      toast.success(t.merchants.updated_success);
      setConfirmAction(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : t.merchants.action_failed);
    },
  });

  async function handleAction() {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      await performAction.mutateAsync(confirmAction);
    } finally {
      setActionLoading(false);
    }
  }

  // ── Filter merchants ──────────────────────────────────────────────────────
  const filtered = (merchants ?? []).filter(m => {
    const matchSearch = !search
      || m.business_name.toLowerCase().includes(search.toLowerCase())
      || m.contact_email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Counts ────────────────────────────────────────────────────────────────
  const counts = {
    all:         merchants?.length ?? 0,
    active:      merchants?.filter(m => m.status === 'active').length ?? 0,
    pending:     merchants?.filter(m => m.status === 'pending').length ?? 0,
    suspended:   merchants?.filter(m => m.status === 'suspended').length ?? 0,
    deactivated: merchants?.filter(m => m.status === 'deactivated').length ?? 0,
  };

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            {t.merchants.title}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t.merchants.subtitle}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t.merchants.add_merchant}
        </Button>
      </div>

      {/* ── Summary Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(Object.entries(counts) as [string, number][]).filter(([k]) => k !== 'all').map(([status, count]) => {
          const cfg = STATUS_CONFIG[status as MerchantStatus];
          return (
            <Card key={status} className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === status ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  {cfg?.icon}
                  <span className="text-xs text-muted-foreground capitalize">{status}</span>
                </div>
                <p className="text-2xl font-bold">{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t.merchants.search_placeholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder={t.merchants.status} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.merchants.all_label.replace('{count}', String(counts.all))}</SelectItem>
            <SelectItem value="active">{t.merchants.active_label.replace('{count}', String(counts.active))}</SelectItem>
            <SelectItem value="pending">{t.merchants.pending_label.replace('{count}', String(counts.pending))}</SelectItem>
            <SelectItem value="suspended">{t.merchants.suspended_label.replace('{count}', String(counts.suspended))}</SelectItem>
            <SelectItem value="deactivated">{t.merchants.deactivated_label.replace('{count}', String(counts.deactivated))}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ['merchants'] })}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.merchants.merchant_header}</TableHead>
                    <TableHead>{t.merchants.contact}</TableHead>
                    <TableHead>{t.merchants.status}</TableHead>
                    <TableHead>{t.merchants.verification}</TableHead>
                    <TableHead>{t.merchants.onboarding}</TableHead>
                    <TableHead>{t.merchants.registered}</TableHead>
                    <TableHead className="text-right">{t.merchants.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-16">
                        <div className="flex flex-col items-center gap-3">
                          <Building2 className="h-10 w-10 text-muted-foreground/40" />
                          <div>
                            <p className="font-medium text-muted-foreground">{t.merchants.no_merchants}</p>
                            <p className="text-sm text-muted-foreground/70">
                              {search ? t.merchants.try_adjusting_search : t.merchants.add_first_merchant}
                            </p>
                          </div>
                          {!search && (
                            <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2">
                              <Plus className="h-4 w-4" /> {t.merchants.add_merchant}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(merchant => (
                    <TableRow key={merchant.id}>
                      <TableCell>
                        <div>
                          <p className="font-semibold">{merchant.business_name}</p>
                          {merchant.business_type && (
                            <p className="text-xs text-muted-foreground capitalize">{merchant.business_type}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{merchant.contact_name}</p>
                          <p className="text-muted-foreground text-xs">{merchant.contact_email}</p>
                        </div>
                      </TableCell>
                      <TableCell><MerchantStatusBadge status={merchant.status} /></TableCell>
                      <TableCell>
                        <Badge variant={VERIFICATION_CONFIG[merchant.verification_status].variant}>
                          {VERIFICATION_CONFIG[merchant.verification_status].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-1.5 w-16">
                            <div
                              className="bg-primary h-1.5 rounded-full"
                              style={{ width: `${Math.min(((merchant.onboarding_step - 1) / 4) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {merchant.onboarding_completed ? t.merchants.done : `${merchant.onboarding_step}/5`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(merchant.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>{t.merchants.actions}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setViewMerchant(merchant)}>
                              <Eye className="h-4 w-4 mr-2" /> {t.merchants.view_details}
                            </DropdownMenuItem>
                            {merchant.status !== 'active' && (
                              <DropdownMenuItem
                                onClick={() => setConfirmAction({ type: 'activate', merchant })}
                                className="text-green-600"
                              >
                                <CheckCircle className="h-4 w-4 mr-2" /> {t.merchants.activate}
                              </DropdownMenuItem>
                            )}
                            {merchant.verification_status !== 'verified' && (
                              <DropdownMenuItem
                                onClick={() => setConfirmAction({ type: 'verify', merchant })}
                                className="text-blue-600"
                              >
                                <FileText className="h-4 w-4 mr-2" /> {t.merchants.mark_verified}
                              </DropdownMenuItem>
                            )}
                            {merchant.status === 'active' && (
                              <DropdownMenuItem
                                onClick={() => setConfirmAction({ type: 'suspend', merchant })}
                                className="text-orange-600"
                              >
                                <Ban className="h-4 w-4 mr-2" /> {t.merchants.suspend}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setConfirmAction({ type: 'delete', merchant })}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> {t.merchants.delete}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}
      <CreateMerchantDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['merchants'] })}
        orgId={orgId}
      />

      <ViewMerchantDialog
        merchant={viewMerchant}
        onClose={() => setViewMerchant(null)}
      />

      <ConfirmDialog
        open={!!confirmAction}
        title={
          confirmAction?.type === 'activate'  ? t.merchants.activate_title :
          confirmAction?.type === 'suspend'   ? t.merchants.suspend_title  :
          confirmAction?.type === 'verify'    ? t.merchants.verify_title   :
          t.merchants.delete_merchant_title
        }
        message={
          confirmAction?.type === 'activate'
            ? t.merchants.activate_confirm.replace('{name}', confirmAction.merchant.business_name)
            : confirmAction?.type === 'suspend'
            ? t.merchants.suspend_confirm.replace('{name}', confirmAction?.merchant.business_name ?? '')
            : confirmAction?.type === 'verify'
            ? t.merchants.verify_confirm.replace('{name}', confirmAction?.merchant.business_name ?? '')
            : t.merchants.delete_confirm.replace('{name}', confirmAction?.merchant.business_name ?? '')
        }
        variant={confirmAction?.type === 'delete' || confirmAction?.type === 'suspend' ? 'destructive' : 'default'}
        onConfirm={handleAction}
        onCancel={() => setConfirmAction(null)}
        loading={actionLoading}
      />
    </div>
  );
}
