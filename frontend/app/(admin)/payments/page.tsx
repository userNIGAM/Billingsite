'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardBody } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Textarea } from '../../../components/ui/Input';
import { Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/ui/EmptyState';
import { LoadingState } from '../../../components/ui/Spinner';
import { Pagination } from '../../../components/ui/Pagination';
import { useToast } from '../../../providers/ToastProvider';
import { useAsync } from '../../../hooks/useAsync';
import { khataService } from '../../../lib/services/khataService';
import { paymentService } from '../../../lib/services/operationService';
import { ApiError } from '../../../lib/apiClient';
import type { DigitalChannel, Payment, PaymentMethod } from '../../../types/api';
import { formatNPR, rupeesToPaisa } from '../../../utils/money';
import { formatDate, todayBusinessDate } from '../../../utils/date';

export default function PaymentsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PaymentsView />
    </Suspense>
  );
}

function PaymentsView() {
  const searchParams = useSearchParams();

  const [khataId, setKhataId] = useState(searchParams.get('khataId') ?? '');
  const [staffId] = useState(searchParams.get('staffId') ?? '');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [page, setPage] = useState(1);
  const [recordOpen, setRecordOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);

  const khatas = useAsync((signal) => khataService.listAll({}, signal), []);

  const result = useAsync(
    (signal) =>
      paymentService.list(
        {
          khataId: khataId || undefined,
          staffId: staffId || undefined,
          method: method || undefined,
          page,
          limit: 20,
        },
        signal
      ),
    [khataId, staffId, method, page]
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Payments"
        description="Enter how much was received and when. The remaining bill balance updates automatically."
        actions={<Button onClick={() => setRecordOpen(true)}>Record payment</Button>}
      />

      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Select label="Khata" value={khataId} onChange={(e) => { setKhataId(e.target.value); setPage(1); }}>
            <option value="">All khatas</option>
            {(khatas.data ?? []).map((k) => (
              <option key={k._id} value={k._id}>{k.displayName}</option>
            ))}
          </Select>
          <Select label="Method" value={method} onChange={(e) => { setMethod(e.target.value as PaymentMethod | ''); setPage(1); }}>
            <option value="">All methods</option>
            <option value="CASH">Cash</option>
            <option value="DIGITAL">Digital</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>

        {result.loading ? (
          <LoadingState />
        ) : result.error ? (
          <EmptyState title="Could not load payments" description={result.error} action={<Button onClick={result.reload}>Retry</Button>} />
        ) : !result.data || result.data.rows.length === 0 ? (
          <CardBody>
            <EmptyState
              title="No payments found"
              description="Record a payment by entering the amount received and the date."
              action={<Button onClick={() => setRecordOpen(true)}>Record payment</Button>}
            />
          </CardBody>
        ) : (
          <>
            <Table>
              <THead>
                <Tr>
                  <Th>Code</Th>
                  <Th>Payer</Th>
                  <Th>Date</Th>
                  <Th>Method</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Credit left</Th>
                  <Th>Status</Th>
                  <Th align="right"> </Th>
                </Tr>
              </THead>
              <TBody>
                {result.data.rows.map((p) => (
                  <Tr key={p._id}>
                    <Td className="font-mono text-xs">{p.paymentCode}</Td>
                    <Td>{p.payerNameSnapshot || p.khataName || '—'}</Td>
                    <Td>{formatDate(p.paymentDate)}</Td>
                    <Td>
                      <Badge tone="gray">{p.method}</Badge>
                      {p.digitalChannel ? <span className="ml-1 text-xs text-gray-500">{p.digitalChannel}</span> : null}
                    </Td>
                    <Td align="right" className="font-medium">{formatNPR(p.amountPaisa)}</Td>
                    <Td align="right">{formatNPR(p.unallocatedPaisa)}</Td>
                    <Td>{p.isVoided ? <Badge tone="red">VOIDED</Badge> : <Badge tone="green">ACTIVE</Badge>}</Td>
                    <Td align="right">
                      {!p.isVoided ? (
                        <Button variant="ghost" size="sm" onClick={() => setVoidTarget(p)}>Void</Button>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination meta={result.data.meta} onPageChange={setPage} disabled={result.loading} />
          </>
        )}
      </Card>

      <RecordPaymentModal
        open={recordOpen}
        khatas={(khatas.data ?? []).map((k) => ({ _id: k._id, name: k.displayName, type: k.type }))}
        onClose={() => setRecordOpen(false)}
        onSaved={() => {
          setRecordOpen(false);
          result.reload();
        }}
      />

      <VoidPaymentModal
        payment={voidTarget}
        onClose={() => setVoidTarget(null)}
        onSaved={() => {
          setVoidTarget(null);
          result.reload();
        }}
      />
    </div>
  );
}

function RecordPaymentModal({
  open,
  khatas,
  onClose,
  onSaved,
}: {
  open: boolean;
  khatas: Array<{ _id: string; name: string; type: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [khataId, setKhataId] = useState('');
  const [officePayer, setOfficePayer] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [channel, setChannel] = useState<DigitalChannel>('ESEWA');
  const [paymentDate, setPaymentDate] = useState(todayBusinessDate());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selected = khatas.find((k) => k._id === khataId);
  const bosses = useAsync(
    (signal) => khataService.listBosses(khataId, signal),
    [khataId],
    { enabled: Boolean(khataId) && selected?.type === 'OFFICE' }
  );
  const staff = useAsync(
    (signal) => khataService.listStaff({ khataId, status: 'ACTIVE' }, signal),
    [khataId],
    { enabled: Boolean(khataId) && selected?.type === 'OFFICE' }
  );
  const selfPayingStaff = (staff.data ?? []).filter((person) => person.billingResponsibility === 'SELF');
  const balance = useAsync(
    (signal) => {
      if (!khataId || !selected) return Promise.resolve(0);
      if (selected.type === 'OFFICE') {
        if (officePayer.startsWith('staff:')) {
          return khataService.staffSummary(officePayer.slice(6), signal).then((summary) => summary.duePaisa);
        }
        if (officePayer.startsWith('boss:')) {
          return khataService.bossSummary(officePayer.slice(5), signal).then((summary) => summary.duePaisa);
        }
        return Promise.resolve(0);
      }
      return khataService.summary(khataId, undefined, signal).then((summary) => summary.bills.outstandingPaisa);
    },
    [khataId, officePayer, selected?.type],
    { enabled: Boolean(khataId) && (selected?.type !== 'OFFICE' || Boolean(officePayer)) }
  );

  async function save() {
    if (!khataId) { setError('Choose a khata.'); return; }
    if (selected?.type === 'OFFICE' && !officePayer) {
      setError('Choose an office group or a self-paying staff member.');
      return;
    }
    const amountPaisa = rupeesToPaisa(Number(amount));
    if (!Number.isFinite(amountPaisa) || amountPaisa <= 0) { setError('Enter a valid amount.'); return; }
    setSaving(true);
    setError('');
    try {
      const payment = await paymentService.record({
        khataId,
        bossId: officePayer.startsWith('boss:') ? officePayer.slice(5)
          : (officePayer.startsWith('staff:')
            ? selfPayingStaff.find((person) => person._id === officePayer.slice(6))?.bossId
            : null),
        staffId: officePayer.startsWith('staff:') ? officePayer.slice(6) : null,
        amountPaisa,
        method,
        digitalChannel: method === 'DIGITAL' ? channel : null,
        paymentDate,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      const appliedPaisa = payment.allocations.reduce((sum, allocation) => sum + allocation.amountPaisa, 0);
      let remainingDueText = '';
      try {
        const remainingDuePaisa = selected?.type === 'OFFICE'
          ? officePayer.startsWith('staff:')
            ? (await khataService.staffSummary(officePayer.slice(6))).duePaisa
            : (await khataService.bossSummary(officePayer.slice(5))).duePaisa
          : (await khataService.summary(khataId)).bills.outstandingPaisa;
        remainingDueText = ` Remaining bill due: ${formatNPR(remainingDuePaisa)}.`;
      } catch {
        remainingDueText = ' Payment saved; balance could not be refreshed.';
      }
      toast.success(`Payment of ${formatNPR(payment.amountPaisa)} recorded. ${formatNPR(appliedPaisa)} applied to bills.${remainingDueText}`);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Record payment"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Record</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label="Khata" required value={khataId} onChange={(e) => { setKhataId(e.target.value); setOfficePayer(''); }}>
          <option value="">Select a khata…</option>
          {khatas.map((k) => (
            <option key={k._id} value={k._id}>{k.name} ({k.type})</option>
          ))}
        </Select>

        {selected?.type === 'OFFICE' ? (
          <Select label="Payment for" required value={officePayer} onChange={(e) => setOfficePayer(e.target.value)}>
            <option value="">Choose office group or staff…</option>
            <optgroup label="Office-paid groups">
              {(bosses.data ?? []).map((b) => (
                <option key={b._id} value={`boss:${b._id}`}>{b.name}</option>
              ))}
            </optgroup>
            {selfPayingStaff.length > 0 && (
              <optgroup label="Staff paying personally">
                {selfPayingStaff.map((person) => (
                  <option key={person._id} value={`staff:${person._id}`}>{person.name} — {person.bossName}</option>
                ))}
              </optgroup>
            )}
          </Select>
        ) : null}

        {khataId && (selected?.type !== 'OFFICE' || officePayer) ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            {balance.loading ? (
              <p className="text-sm text-gray-500">Loading current balance…</p>
            ) : balance.error ? (
              <p className="text-sm text-red-600">Could not load balance: {balance.error}</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Outstanding before payment</span>
                  <span className="font-medium text-gray-900">{formatNPR(balance.data ?? 0)}</span>
                </div>
                {Number(amount) > 0 && (
                  <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 text-sm">
                    <span className="text-gray-600">Estimated remaining after payment</span>
                    <span className="font-semibold text-brand-700">
                      {formatNPR(Math.max(0, (balance.data ?? 0) - rupeesToPaisa(Number(amount))))}
                    </span>
                  </div>
                )}
                {(balance.data ?? 0) === 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    No bill balance is due for this billing group. This payment will be kept as credit for the next bill.
                  </p>
                )}
              </>
            )}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Amount received (NPR)" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Date received" type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            <option value="CASH">Cash</option>
            <option value="DIGITAL">Digital</option>
            <option value="OTHER">Other</option>
          </Select>
          {method === 'DIGITAL' ? (
            <Select label="Channel" value={channel ?? 'ESEWA'} onChange={(e) => setChannel(e.target.value as DigitalChannel)}>
              <option value="ESEWA">eSewa</option>
              <option value="KHALTI">Khalti</option>
              <option value="BANK">Bank</option>
              <option value="QR">QR</option>
            </Select>
          ) : null}
        </div>

        <details className="rounded-md border border-gray-200 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            More details (optional)
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            <Textarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </details>
      </div>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}

function VoidPaymentModal({
  payment,
  onClose,
  onSaved,
}: {
  payment: Payment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!payment) return;
    if (!reason.trim()) { setError('A reason is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await paymentService.voidPayment(payment._id, reason.trim());
      toast.success('Payment voided.');
      setReason('');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not void the payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(payment)}
      title="Void payment"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="danger" onClick={save} loading={saving}>Void payment</Button>
        </>
      }
    >
      <p className="text-sm text-gray-600">
        Voiding releases this payment&apos;s allocations back onto the affected bills.
      </p>
      <div className="mt-3">
        <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}
