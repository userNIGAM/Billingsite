'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Card, CardBody } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { Modal } from '../../../../components/ui/Modal';
import { Textarea } from '../../../../components/ui/Input';
import { Table, TBody, Td, Th, THead, Tr } from '../../../../components/ui/Table';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { LoadingState } from '../../../../components/ui/Spinner';
import { useToast } from '../../../../providers/ToastProvider';
import { useAsync } from '../../../../hooks/useAsync';
import { billService } from '../../../../lib/services/operationService';
import { settingsService } from '../../../../lib/services/insightService';
import { ApiError } from '../../../../lib/apiClient';
import { formatNPR } from '../../../../utils/money';
import { formatDate, formatDateTime } from '../../../../utils/date';

export default function BillDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const toast = useToast();
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState('');

  const bill = useAsync((signal) => billService.detail(id, signal), [id]);
  const profile = useAsync((signal) => settingsService.getProfile(signal), []);

  if (bill.loading) return <LoadingState message="Loading bill…" />;
  if (bill.error || !bill.data) {
    return (
      <Card>
        <EmptyState
          title="Bill not found"
          description={bill.error ?? ''}
          action={<Link href="/bills"><Button variant="secondary">Back to bills</Button></Link>}
        />
      </Card>
    );
  }

  const b = bill.data;

  async function voidBill() {
    if (!reason.trim()) {
      setVoidError('A reason is required.');
      return;
    }
    setVoiding(true);
    setVoidError('');
    try {
      await billService.voidBill(id, reason.trim());
      toast.success('Bill voided; payment credit released.');
      setVoidOpen(false);
      setReason('');
      bill.reload();
    } catch (err) {
      setVoidError(err instanceof ApiError ? err.message : 'Could not void the bill.');
    } finally {
      setVoiding(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div data-print-hide>
        <PageHeader
          title={`Bill ${b.billNumber}`}
          description={`${b.payerNameSnapshot} · ${formatDate(b.periodStart)} – ${formatDate(b.periodEnd)}`}
          actions={
            <>
              <Link href={`/payments?khataId=${b.khataId}`}>
                <Button variant="secondary">Record payment</Button>
              </Link>
              <Button variant="secondary" onClick={() => window.print()}>Print</Button>
              {!b.isVoided ? (
                <Button variant="danger" onClick={() => setVoidOpen(true)}>Void bill</Button>
              ) : null}
            </>
          }
        />
      </div>

      <Card className="mx-auto w-full max-w-4xl overflow-hidden print:max-w-none print:rounded-none print:border-0">
        <div className="border-b-2 border-gray-900 px-5 py-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">PAN Bill</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">{profile.data?.name || 'Canteen'}</h2>
              {profile.data?.address ? <p className="mt-1 text-sm text-gray-600">{profile.data.address}</p> : null}
              {profile.data?.phone ? <p className="mt-1 text-sm text-gray-600">Phone: {profile.data.phone}</p> : null}
              {profile.data?.panNumber ? <p className="mt-1 text-sm font-semibold text-gray-800">PAN: {profile.data.panNumber}</p> : null}
            </div>
            <div className="min-w-48 rounded-md bg-gray-50 px-4 py-3 text-right print:bg-transparent print:p-0">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Bill number</p>
              <p className="mt-1 font-mono text-lg font-bold text-gray-950">{b.billNumber}</p>
              <p className="mt-2 text-xs text-gray-500">Bill date</p>
              <p className="text-sm font-medium text-gray-900">{formatDate(b.generatedAt)}</p>
              <div className="mt-2">
                {b.isVoided ? <Badge tone="red">VOIDED</Badge> : <Badge tone={b.status === 'PAID' ? 'green' : b.status === 'PARTIALLY_PAID' ? 'amber' : 'blue'}>{b.status}</Badge>}
              </div>
            </div>
          </div>
          <div className="mt-5 border-t border-dashed border-gray-300 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Billed to</p>
            <p className="mt-1 text-base font-semibold text-gray-950">{b.payerNameSnapshot}</p>
            <p className="text-xs text-gray-600">{b.scope === 'INDIVIDUAL' ? 'Individual' : b.scope === 'BOSS_GROUP' ? 'Office billing group' : 'Office'}</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm sm:px-8 print:bg-white">
          <p><span className="text-gray-500">Billing period:</span> <span className="font-medium text-gray-900">{formatDate(b.periodStart)} – {formatDate(b.periodEnd)}</span></p>
          <p><span className="text-gray-500">Due date:</span> <span className="font-medium text-gray-900">{formatDate(b.periodEnd)}</span></p>
        </div>

        {b.lineItems.length === 0 ? (
          <EmptyState title="No line items" description="This bill has no recorded consumption." />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>S.N.</Th>
                <Th>Date</Th>
                <Th>Particulars</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Rate (NPR)</Th>
                <Th align="right">Amount (NPR)</Th>
              </Tr>
            </THead>
            <TBody>
              {b.lineItems.map((line, idx) => (
                <Tr key={`${line.itemId}-${idx}`}>
                  <Td>{idx + 1}</Td>
                  <Td>{formatDate(line.businessDate)}</Td>
                  <Td>{line.itemNameSnapshot}</Td>
                  <Td align="right">{line.quantity}</Td>
                  <Td align="right">{formatNPR(line.unitPricePaisa)}</Td>
                  <Td align="right">{formatNPR(line.totalPaisa)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}

        <CardBody className="border-t border-gray-200 sm:px-8">
          <dl className="ml-auto grid max-w-sm grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <dt className="text-gray-600">Current period total</dt>
            <dd className="text-right tabular-nums">{formatNPR(b.consumptionTotalPaisa)}</dd>
            <dt className="text-gray-600">Previous balance</dt>
            <dd className="text-right tabular-nums">{formatNPR(b.previousDuePaisa)}</dd>
            <dt className="text-gray-600">Advance/credit applied</dt>
            <dd className="text-right tabular-nums">− {formatNPR(b.creditAppliedPaisa)}</dd>
            <dt className="border-t border-gray-300 pt-2 font-semibold text-gray-950">Total payable</dt>
            <dd className="border-t border-gray-300 pt-2 text-right font-semibold tabular-nums text-gray-950">{formatNPR(b.totalPayablePaisa)}</dd>
            <dt className="text-gray-600">Amount received</dt>
            <dd className="text-right tabular-nums">{formatNPR(b.paidPaisa)}</dd>
            <dt className="border-t-2 border-gray-900 pt-2 text-base font-bold text-gray-950">Balance due</dt>
            <dd className="border-t-2 border-gray-900 pt-2 text-right text-base font-bold tabular-nums text-gray-950">{formatNPR(b.duePaisa)}</dd>
          </dl>
        </CardBody>

        {b.isVoided ? (
          <CardBody className="border-t border-gray-100 bg-red-50/50 text-sm text-red-800">
            Voided{b.voidedAt ? ` on ${formatDateTime(b.voidedAt)}` : ''}. {b.voidReason}
          </CardBody>
        ) : null}
        {profile.data?.billingNote ? (
          <CardBody className="border-t border-gray-100 text-center text-xs text-gray-600 sm:px-8">
            {profile.data.billingNote}
          </CardBody>
        ) : null}
        <div className="border-t border-gray-200 px-5 py-4 text-center text-xs text-gray-500 sm:px-8">
          Thank you for your business.
        </div>
      </Card>

      <Modal
        open={voidOpen}
        title="Void this bill?"
        onClose={() => setVoidOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setVoidOpen(false)} disabled={voiding}>Cancel</Button>
            <Button variant="danger" onClick={voidBill} loading={voiding}>Void bill</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Voiding releases every payment allocated to this bill back as credit for the payer. The bill
          is kept for the record.
        </p>
        <div className="mt-3">
          <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {voidError ? <p className="mt-3 text-xs text-red-600">{voidError}</p> : null}
      </Modal>
    </div>
  );
}
