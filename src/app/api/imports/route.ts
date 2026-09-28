import { apiContext } from '@/lib/auth/api-context';
import { fields, validateRow, type ImportKind } from '@/lib/imports/preview';

export async function GET(request: Request) {
  try {
    const { db, org } = await apiContext();
    const params = new URL(request.url).searchParams;
    const kind = params.get('kind'); const batch = params.get('batch');
    const table = batch ? 'import_rows' : kind && (kind in fields || kind === 'warehouses') ? kind : 'import_batches';
    const rows: any[] = [];
    for (let start = 0; ; start += 1000) {
      let query = (db as any).from(table).select('*').eq('organization_id', org).order('id').range(start,start+999);
      if (batch) query = query.eq('import_batch_id',batch);
      const { data, error } = await query; if (error) throw error;
      rows.push(...data); if (data.length < 1000) break;
    }
    return Response.json(rows);
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Unavailable' }, { status: 403 }); }
}
export async function POST(request: Request) {
  try {
    const { db, org, profile } = await apiContext();
    const body = await request.json();
    if (body.confirm !== true) throw new Error('Review and confirm the import first');
    if (body.action === 'reverse') {
      const { data, error } = await (db as any).rpc('reverse_import',{ batch: body.batch_id, reversal_reason: body.reason });
      if (error) throw error; return Response.json({ id: data });
    }
    const kind = body.kind as ImportKind;
    if (!(kind in fields) || kind === 'staff_invites') throw new Error('Use the owner-only users API for staff invitations');
    if (!Array.isArray(body.rows) || body.rows.length > 100) throw new Error('Send at most 100 rows');
    for (const row of body.rows) { const errors=validateRow(row.data,kind); if (errors.length) throw new Error(`Row ${row.index}: ${errors.join('; ')}`); }
    const { error: batchError } = await (db as any).from('import_batches').upsert({ id: body.batch_id, organization_id: org, kind, created_by: profile.id, summary: body.summary || {} }, { onConflict: 'id', ignoreDuplicates: true });
    if (batchError) throw batchError;
    const { data, error } = await (db as any).rpc('apply_import_chunk', { batch: body.batch_id, import_rows: body.rows, duplicate_mode: body.mode, warehouse: body.warehouse_id || null });
    if (error) throw error;
    return Response.json(data);
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 400 }); }
}
