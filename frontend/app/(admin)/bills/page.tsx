'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { Badge, statusTone } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/ui/EmptyState';
import { LoadingState } from '../../../components/ui/Spinner';
import { Pagination } from '../../../components/ui/Pagination';
import { useToast } from '../../../providers/ToastProvider';
import { useAsync } from '../../../hooks/useAsync';
import { khataService } from '../../../lib/services/khataService';
import { billService, paymentService } from '../../../lib/services/operationService';
import { ApiError } from '../../../lib/apiClient';
import type { BillStatus } from '../../../types/api';
import { formatNPR } from '../../../utils/money';
import { formatDate, todayBusinessDate } from '../../../utils/date';

export default function BillsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <BillsView />
    </Suspense>
  );
}

function BillsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [khataId, setKhataId] = useState(searchParams.get('khataId') ?? '');
  const [staffId] = useState(searchParams.get('staffId') ?? '');
  const [status, setStatus] = useState<BillStatus | ''>('');
  const [page, setPage] = useState(1);
  const [generateOpen, setGenerateOpen] = useState(false);

  const khatas = useAsync((signal) => khataService.listAll({}, signal), []);

  const result = useAsync(
    (signal) =>
      billService.list(
        {
          khataId: khataId || undefined,
          staffId: staffId || undefined,
          status: status || undefined,
          page,
          limit: 20,
        },
        signal
      ),
    [khataId, staffId, status, page]
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Bills"
        description="Period bills generated from each payer's khaja records."
        actions={<Button onClick={() => setGenerateOpen(true)}>Generate bill</Button>}
      />

      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Select label="Khata" value={khataId} onChange={(e) => { setKhataId(e.target.value); setPage(1); }}>
            <option value="">All khatas</option>
            {(khatas.data ?? []).map((k) => (
              <option key={k._id} value={k._id}>{k.displayName}</option>
            ))}
          </Select>
          <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value as BillStatus | ''); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIALLY_PAID">Partially paid</option>
            <option value="PAID">Paid</option>
            <option value="OVERPAID">Overpaid</option>
          </Select>
        </div>

        {result.loading ? (
          <LoadingState />
        ) : result.error ? (
          <EmptyState title="Could not load bills" description={result.error} action={<Button onClick={result.reload}>Retry</Button>} />
        ) : !result.data || result.data.rows.length === 0 ? (
          <EmptyState title="No bills found" description="Generate a bill for a khata to begin." />
        ) : (
          <>
            <Table>
              <THead>
                <Tr>
                  <Th>Bill</Th>
                  <Th>Payer</Th>
                  <Th>Period</Th>
                  <Th>Status</Th>
                  <Th align="right">Payable</Th>
                  <Th align="right">Due</Th>
                  <Th align="right"> </Th>
                </Tr>
              </THead>
              <TBody>
                {result.data.rows.map((b) => (
                  <Tr key={b._id}>
                    <Td className="font-mono text-xs">{b.billNumber}</Td>
                    <Td>{b.payerNameSnapshot}{b.scope !== 'INDIVIDUAL' ? <Badge className="ml-2" tone="blue">{b.scope}</Badge> : null}</Td>
                    <Td className="text-xs">{formatDate(b.periodStart)} – {formatDate(b.periodEnd)}</Td>
                    <Td>
                      {b.isVoided ? <Badge tone="red">VOIDED</Badge> : <Badge tone={statusTone(b.status)}>{b.status}</Badge>}
                    </Td>
                    <Td align="right">{formatNPR(b.totalPayablePaisa)}</Td>
                    <Td align="right" className="font-medium">{formatNPR(b.duePaisa)}</Td>
                    <Td align="right">
                      <Link href={`/bills/${b._id}`}>
                        <Button variant="secondary" size="sm">Open</Button>
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination meta={result.data.meta} onPageChange={setPage} disabled={result.loading} />
          </>
        )}
      </Card>

      <GenerateBillModal
        open={generateOpen}
        khatas={(khatas.data ?? []).map((k) => ({
          _id: k._id,
          name: k.displayName,
          type: k.type,
          billingMode: k.billingMode ?? null,
        }))}
        onClose={() => setGenerateOpen(false)}
        onGenerated={(billId) => {
          setGenerateOpen(false);
          result.reload();
          toast.success('Bill generated.');
          if (billId) router.push(`/bills/${billId}`);
        }}
      />
    </div>
  );
}

function GenerateBillModal({
  open,
  khatas,
  onClose,
  onGenerated,
}: {
  open: boolean;
  khatas: Array<{ _id: string; name: string; type: string; billingMode: string | null }>;
  onClose: () => void;
  onGenerated: (billId: string) => void;
}) {
  const [khataId, setKhataId] = useState('');
  const [officePayer, setOfficePayer] = useState('');
  const [periodStartOverride, setPeriodStartOverride] = useState<string | null>(null);
  const [periodEndOverride, setPeriodEndOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selected = khatas.find((k) => k._id === khataId);
  const selectedBillingMode = selected?.billingMode ?? (selected?.type === 'OFFICE' ? 'MIXED' : null);
  const officeHasOwnLedger = selectedBillingMode === 'DIRECT' || selectedBillingMode === 'MIXED';

  const detail = useAsync((signal) => khataService.detail(khataId, signal), [khataId], { enabled: Boolean(khataId) });
  const fetchOfficeGroups = Boolean(khataId) && selected?.type === 'OFFICE' && selectedBillingMode !== 'DIRECT';
  const bosses = useAsync(
    (signal) => khataService.listBosses(khataId, signal),
    [khataId],
    { enabled: fetchOfficeGroups }
  );
  const staff = useAsync(
    (signal) => khataService.listStaff({ khataId, status: 'ACTIVE' }, signal),
    [khataId],
    { enabled: fetchOfficeGroups }
  );
  const selfPayingStaff = (staff.data ?? []).filter((person) => person.billingResponsibility === 'SELF');

  // A DIRECT office bills only itself — preselect that payer.
  useEffect(() => {
    if (selected?.type === 'OFFICE' && selectedBillingMode === 'DIRECT') {
      setOfficePayer('office');
    }
  }, [selected?.type, selectedBillingMode]);

  const selectedBossId = officePayer.startsWith('boss:') ? officePayer.slice(5) : undefined;
  const selectedStaffId = officePayer.startsWith('staff:') ? officePayer.slice(6) : undefined;
  // officePayer === 'office' bills the office's own ledger (bossId and staffId null).
  const currentDate = todayBusinessDate();
  const currentBillingPeriodStart = detail.data?.currentPeriod.periodStart;
  const previousPayments = useAsync(
    (signal) => paymentService.list({
      khataId,
      bossId: selectedBossId,
      staffId: selectedStaffId,
      isVoided: false,
      from: currentBillingPeriodStart,
      to: currentDate,
      page: 1,
      limit: 1,
    }, signal),
    [khataId, selectedBossId, selectedStaffId, currentBillingPeriodStart, currentDate],
    {
      enabled: Boolean(khataId && currentBillingPeriodStart)
        && (selected?.type !== 'OFFICE' || Boolean(officePayer)),
    }
  );
  const lastPayment = previousPayments.data?.rows[0];
  const referenceStartDate = lastPayment?.paymentDate ?? detail.data?.khata.startDate ?? '';

  const periodStart = periodStartOverride ?? detail.data?.currentPeriod.periodStart ?? '';
  const periodEnd = periodEndOverride ?? detail.data?.currentPeriod.periodEnd ?? '';

  async function save() {
    if (!khataId) { setError('Choose a khata.'); return; }
    if (selected?.type === 'OFFICE' && !officePayer) {
      setError('Choose who is billed — the office, a boss, or a self-paying staff member.');
      return;
    }
    if (!periodStart || !periodEnd) { setError('Set the billing period.'); return; }
    setSaving(true);
    setError('');
    try {
      const { bill } = await billService.generate({
        khataId,
        bossId: selectedBossId ?? null,
        staffId: selectedStaffId ?? null,
        periodStart,
        periodEnd,
      });
      onGenerated(bill._id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the bill.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Generate bill"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Generate</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label="Khata" required value={khataId} onChange={(e) => { setKhataId(e.target.value); setOfficePayer(''); setPeriodStartOverride(null); setPeriodEndOverride(null); }}>
          <option value="">Select a khata…</option>
          {khatas.map((k) => (
            <option key={k._id} value={k._id}>{k.name} ({k.type})</option>
          ))}
        </Select>

        {selected?.type === 'OFFICE' ? (
          <Select
            label="Bill payer"
            required
            value={officePayer}
            onChange={(e) => setOfficePayer(e.target.value)}
          >
            <option value="">Choose who is billed…</option>
            {officeHasOwnLedger ? (
              <optgroup label="Office itself">
                <option value="office">{selected.name} — office pays directly</option>
              </optgroup>
            ) : null}
            {(bosses.data ?? []).length > 0 && (
              <optgroup label="Bosses">
                {[...(bosses.data ?? [])]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((b) => (
                    <option key={b._id} value={`boss:${b._id}`}>{b.name}</option>
                  ))}
              </optgroup>
            )}
            {selfPayingStaff.length > 0 && (
              <optgroup label="Staff who pay personally">
                {selfPayingStaff.map((person) => (
                  <option key={person._id} value={`staff:${person._id}`}>
                    {person.name}{person.bossName ? ` — ${person.bossName}` : ' — office pool'}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Period start" type="date" value={periodStart} onChange={(e) => setPeriodStartOverride(e.target.value)} />
          <Input label="Period end" type="date" value={periodEnd} onChange={(e) => setPeriodEndOverride(e.target.value)} />
        </div>
        {khataId && (selected?.type !== 'OFFICE' || officePayer) ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div>
              <p className="text-xs font-medium text-gray-500">Start date</p>
              {previousPayments.loading ? (
                <p className="mt-1 text-sm text-gray-500">Loading payment history…</p>
              ) : previousPayments.error ? (
                <p className="mt-1 text-sm text-red-600">Could not load payment history: {previousPayments.error}</p>
              ) : referenceStartDate ? (
                <>
                  <p className="mt-1 text-sm font-medium">{formatDate(referenceStartDate)}</p>
                  {lastPayment ? (
                    <p className="text-xs text-gray-500">
                      Recent payment · {formatNPR(lastPayment.amountPaisa)} · {lastPayment.paymentCode}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">Khata start date · no payment in this billing period</p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-gray-500">Khata start date unavailable</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Current date</p>
              <p className="mt-1 text-sm font-medium">{formatDate(currentDate)}</p>
            </div>
          </div>
        ) : null}
        <p className="text-xs text-gray-500">
          Previous bill and payment history is retained. The bill covers the selected billing period; an earlier payment is shown for reference and does not replace its dates.
        </p>
      </div>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}
