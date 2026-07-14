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
const ONBOARDING_STEPS = [
  { step: 1, label: 'Business Information',  icon: <Building2 className="h-4 w-4" /> },
  { step: 2, label: 'Contact & Address',     icon: <MapPin className="h-4 w-4" /> },
  { step: 3, label: 'Document Verification', icon: <FileText className="h-4 w-4" /> },
  { step: 4, label: 'Payment Setup',         icon: <CheckCircle className="h-4 w-4" /> },
  { step: 5, label: 'Complete',              icon: <CheckCircle className="h-4 w-4" /> },
];

// ─── Create Merchant Dialog ───────────────────────────────────────────────────
interface CreateMerchantDialogProps {
  open:     boolean;
  onClose:  () => void;
  onSuccess: () => void;
  orgId:    string;
}

function CreateMerchantDialog({ open, onClose, onSuccess, orgId }: CreateMerchantDialogProps) {
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
      toast.error('Business name, contact name, and email are required');
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
      toast.success('Merchant created successfully');
      onSuccess();
      onClose();
      setForm({
        business_name: '', business_type: '', registration_number: '', tax_id: '',
        contact_name: '', contact_email: '', contact_phone: '',
        address: '', city: '', state: '', country: 'Nigeria', notes: '',
      });
      setStep(1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create merchant';
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
            Register New Merchant
          </DialogTitle>
          <DialogDescription>
            Complete all steps to onboard a new merchant to the platform.
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
            <h3 className="font-semibold text-sm">Step 1: Business Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Business Name *</Label>
                <Input
                  value={form.business_name}
                  onChange={e => updateForm('business_name', e.target.value)}
                  placeholder="ACME Stores Ltd"
                />
              </div>
              <div>
                <Label>Business Type</Label>
                <Select value={form.business_type} onValueChange={v => updateForm('business_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="wholesale">Wholesale</SelectItem>
                    <SelectItem value="restaurant">Restaurant / Food</SelectItem>
                    <SelectItem value="services">Services</SelectItem>
                    <SelectItem value="ecommerce">E-Commerce</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Registration Number</Label>
                <Input
                  value={form.registration_number}
                  onChange={e => updateForm('registration_number', e.target.value)}
                  placeholder="RC-12345678"
                />
              </div>
              <div>
                <Label>Tax ID (TIN)</Label>
                <Input
                  value={form.tax_id}
                  onChange={e => updateForm('tax_id', e.target.value)}
                  placeholder="12345678-0001"
                />
              </div>
              <div>
                <Label>Country</Label>
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
            <h3 className="font-semibold text-sm">Step 2: Contact & Address</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Contact Person Name *</Label>
                <Input
                  value={form.contact_name}
                  onChange={e => updateForm('contact_name', e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <Label>Contact Email *</Label>
                <Input
                  type="email"
                  value={form.contact_email}
                  onChange={e => updateForm('contact_email', e.target.value)}
                  placeholder="john@business.com"
                />
              </div>
              <div>
                <Label>Contact Phone</Label>
                <Input
                  value={form.contact_phone}
                  onChange={e => updateForm('contact_phone', e.target.value)}
                  placeholder="+2348012345678"
                />
              </div>
              <div className="col-span-2">
                <Label>Street Address</Label>
                <Input
                  value={form.address}
                  onChange={e => updateForm('address', e.target.value)}
                  placeholder="123 Business Street"
                />
              </div>
              <div>
                <Label>City</Label>
                <Input
                  value={form.city}
                  onChange={e => updateForm('city', e.target.value)}
                  placeholder="Lagos"
                />
              </div>
              <div>
                <Label>State</Label>
                <Input
                  value={form.state}
                  onChange={e => updateForm('state', e.target.value)}
                  placeholder="Lagos State"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Notes & Confirmation */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Step 3: Review & Confirm</h3>
            <div className="p-4 bg-muted/50 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Business</span>
                <span className="font-medium">{form.business_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact</span>
                <span className="font-medium">{form.contact_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{form.contact_email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Location</span>
                <span className="font-medium">{[form.city, form.state, form.country].filter(Boolean).join(', ')}</span>
              </div>
            </div>
            <div>
              <Label>Internal Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={e => updateForm('notes', e.target.value)}
                placeholder="Any additional notes about this merchant..."
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)}>Back</Button>
          )}
          {step < 3 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !form.business_name}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? 'Creating...' : 'Create Merchant'}
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
      toast.success('Device limits updated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update device limits');
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
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Business Details</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Business Type"       value={merchant.business_type} />
              <Detail label="Registration No."    value={merchant.registration_number} />
              <Detail label="Tax ID"              value={merchant.tax_id} />
              <Detail label="Country"             value={merchant.country} />
              <Detail label="Registered"          value={new Date(merchant.created_at).toLocaleDateString()} />
              <Detail label="Last Updated"        value={new Date(merchant.updated_at).toLocaleDateString()} />
            </div>
          </section>

          {/* Contact Information */}
          <section>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contact</h4>
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
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Onboarding Progress</h4>
            <div className="space-y-2">
              {ONBOARDING_STEPS.map(s => (
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
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Device Limits</h4>
              <Button variant="ghost" size="sm" onClick={() => setEditDevices(!editDevices)}>
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            </div>
            {deviceLimits ? (
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="h-4 w-4 text-primary" />
                  <span className="font-medium">{deviceLimits.plan_type} plan</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-background rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${Math.min((deviceLimits.current_devices / deviceLimits.max_devices) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {deviceLimits.current_devices} / {deviceLimits.max_devices} devices
                  </span>
                </div>
                {editDevices && (
                  <div className="mt-3 flex items-center gap-2">
                    <Label className="text-xs">Max devices:</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={newMaxDevices}
                      onChange={e => setNewMaxDevices(Number(e.target.value))}
                      className="h-7 w-20 text-xs"
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={saveDeviceLimits} disabled={savingDevices}>
                      {savingDevices ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No device limit data</p>
            )}
          </section>

          {/* Notes */}
          {merchant.notes && (
            <section>
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</h4>
              <p className="text-sm bg-muted/50 p-3 rounded-lg">{merchant.notes}</p>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
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
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant={variant} onClick={onConfirm} disabled={loading}>
            {loading ? 'Processing…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MerchantsPage() {
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

      // Admins & owners see all; others see their org only
      if ((user?.role as string) !== 'owner' && user?.role !== 'super_admin') {
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
      toast.success('Merchant updated successfully');
      setConfirmAction(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Action failed');
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
            Merchants
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage merchant accounts, onboarding, and device limits
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Merchant
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
            placeholder="Search merchants…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({counts.all})</SelectItem>
            <SelectItem value="active">Active ({counts.active})</SelectItem>
            <SelectItem value="pending">Pending ({counts.pending})</SelectItem>
            <SelectItem value="suspended">Suspended ({counts.suspended})</SelectItem>
            <SelectItem value="deactivated">Deactivated ({counts.deactivated})</SelectItem>
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
                    <TableHead>Merchant</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>Onboarding</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-16">
                        <div className="flex flex-col items-center gap-3">
                          <Building2 className="h-10 w-10 text-muted-foreground/40" />
                          <div>
                            <p className="font-medium text-muted-foreground">No merchants found</p>
                            <p className="text-sm text-muted-foreground/70">
                              {search ? 'Try adjusting your search' : 'Add your first merchant to get started'}
                            </p>
                          </div>
                          {!search && (
                            <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2">
                              <Plus className="h-4 w-4" /> Add Merchant
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
                            {merchant.onboarding_completed ? 'Done' : `${merchant.onboarding_step}/5`}
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
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setViewMerchant(merchant)}>
                              <Eye className="h-4 w-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            {merchant.status !== 'active' && (
                              <DropdownMenuItem
                                onClick={() => setConfirmAction({ type: 'activate', merchant })}
                                className="text-green-600"
                              >
                                <CheckCircle className="h-4 w-4 mr-2" /> Activate
                              </DropdownMenuItem>
                            )}
                            {merchant.verification_status !== 'verified' && (
                              <DropdownMenuItem
                                onClick={() => setConfirmAction({ type: 'verify', merchant })}
                                className="text-blue-600"
                              >
                                <FileText className="h-4 w-4 mr-2" /> Mark Verified
                              </DropdownMenuItem>
                            )}
                            {merchant.status === 'active' && (
                              <DropdownMenuItem
                                onClick={() => setConfirmAction({ type: 'suspend', merchant })}
                                className="text-orange-600"
                              >
                                <Ban className="h-4 w-4 mr-2" /> Suspend
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setConfirmAction({ type: 'delete', merchant })}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
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
          confirmAction?.type === 'activate'  ? 'Activate Merchant' :
          confirmAction?.type === 'suspend'   ? 'Suspend Merchant'  :
          confirmAction?.type === 'verify'    ? 'Verify Merchant'   :
          'Delete Merchant'
        }
        message={
          confirmAction?.type === 'activate'
            ? `Activate "${confirmAction.merchant.business_name}"? This will enable full platform access.`
            : confirmAction?.type === 'suspend'
            ? `Suspend "${confirmAction?.merchant.business_name}"? They will lose access until re-activated.`
            : confirmAction?.type === 'verify'
            ? `Mark "${confirmAction?.merchant.business_name}" as verified?`
            : `Permanently delete "${confirmAction?.merchant.business_name}"? This cannot be undone.`
        }
        variant={confirmAction?.type === 'delete' || confirmAction?.type === 'suspend' ? 'destructive' : 'default'}
        onConfirm={handleAction}
        onCancel={() => setConfirmAction(null)}
        loading={actionLoading}
      />
    </div>
  );
}
