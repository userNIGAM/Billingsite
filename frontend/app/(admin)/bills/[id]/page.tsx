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

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{profile.data?.name || 'Canteen'}</h2>
            {profile.data?.address ? <p className="text-xs text-gray-500">{profile.data.address}</p> : null}
            {profile.data?.phone ? <p className="text-xs text-gray-500">Phone: {profile.data.phone}</p> : null}
          </div>
          <div className="text-right">
            <p className="font-mono text-sm font-semibold text-gray-900">{b.billNumber}</p>
            <p className="text-xs text-gray-500">Generated {formatDateTime(b.generatedAt)}</p>
            {b.isVoided ? <Badge tone="red">VOIDED</Badge> : <Badge tone={b.status === 'PAID' ? 'green' : b.status === 'PARTIALLY_PAID' ? 'amber' : 'blue'}>{b.status}</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Billed to</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{b.payerNameSnapshot}</p>
            <p className="text-xs text-gray-500">{b.scope === 'INDIVIDUAL' ? 'Individual' : b.scope === 'BOSS_GROUP' ? 'Boss group' : 'Office'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Period</p>
            <p className="mt-1 text-sm text-gray-900">{formatDate(b.periodStart)} – {formatDate(b.periodEnd)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Due date</p>
            <p className="mt-1 text-sm text-gray-900">{formatDate(b.periodEnd)}</p>
          </div>
        </div>

        {b.lineItems.length === 0 ? (
          <EmptyState title="No line items" description="This bill has no recorded consumption." />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Date</Th>
                <Th>Item</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Unit</Th>
                <Th align="right">Amount</Th>
              </Tr>
            </THead>
            <TBody>
              {b.lineItems.map((line, idx) => (
                <Tr key={`${line.itemId}-${idx}`}>
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

        <CardBody className="border-t border-gray-100">
          <dl className="ml-auto grid max-w-xs grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-gray-500">Consumption</dt>
            <dd className="text-right tabular-nums">{formatNPR(b.consumptionTotalPaisa)}</dd>
            <dt className="text-gray-500">Previous due</dt>
            <dd className="text-right tabular-nums">{formatNPR(b.previousDuePaisa)}</dd>
            <dt className="text-gray-500">Credit applied</dt>
            <dd className="text-right tabular-nums">− {formatNPR(b.creditAppliedPaisa)}</dd>
            <dt className="border-t border-gray-200 pt-1.5 font-medium text-gray-900">Total payable</dt>
            <dd className="border-t border-gray-200 pt-1.5 text-right font-medium tabular-nums text-gray-900">{formatNPR(b.totalPayablePaisa)}</dd>
            <dt className="text-gray-500">Paid</dt>
            <dd className="text-right tabular-nums">{formatNPR(b.paidPaisa)}</dd>
            <dt className="font-semibold text-gray-900">Balance due</dt>
            <dd className="text-right font-semibold tabular-nums text-brand-700">{formatNPR(b.duePaisa)}</dd>
          </dl>
        </CardBody>

        {b.isVoided ? (
          <CardBody className="border-t border-gray-100 bg-red-50/50 text-sm text-red-800">
            Voided{b.voidedAt ? ` on ${formatDateTime(b.voidedAt)}` : ''}. {b.voidReason}
          </CardBody>
        ) : null}
        {profile.data?.billingNote ? (
          <CardBody className="border-t border-gray-100 text-center text-xs text-gray-500">
            {profile.data.billingNote}
          </CardBody>
        ) : null}
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
