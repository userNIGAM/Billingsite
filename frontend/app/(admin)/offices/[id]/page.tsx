'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../../components/ui/Input';
import { Badge, statusTone } from '../../../../components/ui/Badge';
import { Modal } from '../../../../components/ui/Modal';
import { StatCard } from '../../../../components/ui/StatCard';
import { Table, TBody, Td, Th, THead, Tr } from '../../../../components/ui/Table';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { LoadingState } from '../../../../components/ui/Spinner';
import { useToast } from '../../../../providers/ToastProvider';
import { useAsync } from '../../../../hooks/useAsync';
import { khataService } from '../../../../lib/services/khataService';
import { ApiError } from '../../../../lib/apiClient';
import { formatNPR, rupeesToPaisa } from '../../../../utils/money';
import { formatDate } from '../../../../utils/date';

export default function BossDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<{ staffId: string; name: string } | null>(null);

  const summary = useAsync((signal) => khataService.bossSummary(id, signal), [id]);
  const staff = useAsync((signal) => khataService.listStaff({ bossId: id }, signal), [id]);
  const moveTargets = useAsync(
    (signal) => khataService.listBosses(summary.data?.boss.khataId ?? '', signal),
    [summary.data?.boss.khataId],
    { enabled: Boolean(summary.data?.boss.khataId) }
  );

  if (summary.loading) return <LoadingState message="Loading boss…" />;
  if (summary.error || !summary.data) {
    return (
      <Card>
        <EmptyState
          title="Boss not found"
          description={summary.error ?? ''}
          action={<Link href="/offices"><Button variant="secondary">Back to offices</Button></Link>}
        />
      </Card>
    );
  }

  const { boss, duePaisa } = summary.data;
  const staffRows = staff.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={boss.name}
        description={`Boss under office khata`}
        actions={
          <Link href={`/khatas/${boss.khataId}`}>
            <Button variant="secondary">Open office khata</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Outstanding" value={formatNPR(duePaisa)} tone={duePaisa > 0 ? 'warning' : 'positive'} />
        <StatCard label="Staff" value={String(staffRows.length)} hint={`${staffRows.filter((s) => s.status === 'ACTIVE').length} active`} />
        <StatCard label="Status" value={boss.status} hint={boss.phone || 'No phone'} />
        <StatCard label="Started" value={formatDate(boss.startDate)} />
      </div>

      <Card>
        <CardHeader
          title="Staff"
          subtitle="People who take khaja under this boss."
          action={<Button size="sm" onClick={() => setAddOpen(true)}>Add staff</Button>}
        />
        {staff.loading ? (
          <LoadingState />
        ) : staffRows.length === 0 ? (
          <EmptyState title="No staff yet" description="Add staff so their entries can be billed to this boss." />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Billing</Th>
                <Th>Status</Th>
                <Th>Started</Th>
                <Th align="right"> </Th>
              </Tr>
            </THead>
            <TBody>
              {staffRows.map((s) => (
                <Tr key={s._id}>
                  <Td className="font-medium text-gray-900">{s.name}</Td>
                  <Td>{s.phone || '—'}</Td>
                  <Td>{s.billingResponsibility === 'SELF' ? 'Staff pays' : 'Office pays'}</Td>
                  <Td><Badge tone={statusTone(s.status)}>{s.status}</Badge></Td>
                  <Td>{formatDate(s.startDate)}</Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setTransferTarget({ staffId: s._id, name: s.name })}>
                        Transfer
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await khataService.setStaffStatus(s._id, s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
                            toast.success(`${s.name} updated.`);
                            staff.reload();
                          } catch (err) {
                            toast.error(err instanceof ApiError ? err.message : 'Failed.');
                          }
                        }}
                      >
                        {s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Recent activity" subtitle="Bills and payments for this boss." />
        <CardBody className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Bills</p>
            {!summary.data.bills || summary.data.bills.length === 0 ? (
              <p className="text-sm text-gray-500">No bills yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {summary.data.bills.slice(0, 5).map((b) => (
                  <li key={b._id} className="flex items-center justify-between py-2">
                    <Link href={`/bills/${b._id}`} className="font-medium text-brand-700 hover:underline">
                      {b.billNumber}
                    </Link>
                    <span className="tabular-nums">{formatNPR(b.totalPayablePaisa)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payments</p>
            {!summary.data.payments || summary.data.payments.length === 0 ? (
              <p className="text-sm text-gray-500">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {summary.data.payments.slice(0, 5).map((p) => (
                  <li key={p._id} className="flex items-center justify-between py-2">
                    <span className="font-mono text-xs">{p.paymentCode}</span>
                    <span className="tabular-nums">{formatNPR(p.amountPaisa)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardBody>
      </Card>

      <AddStaffModal
        open={addOpen}
        khataId={boss.khataId}
        bossId={boss._id}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          staff.reload();
        }}
      />

      <TransferStaffModal
        target={transferTarget}
        bosses={(moveTargets.data ?? []).filter((b) => b._id !== boss._id)}
        onClose={() => setTransferTarget(null)}
        onSaved={() => {
          setTransferTarget(null);
          staff.reload();
        }}
      />
    </div>
  );
}

function AddStaffModal({
  open,
  khataId,
  bossId,
  onClose,
  onSaved,
}: {
  open: boolean;
  khataId: string;
  bossId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [billingResponsibility, setBillingResponsibility] = useState<'OFFICE' | 'SELF'>('OFFICE');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim()) {
      setError('A name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await khataService.createStaff({
        khataId,
        bossId,
        name: name.trim(),
        billingResponsibility,
        openingBalancePaisa:
          billingResponsibility === 'SELF' ? rupeesToPaisa(Number(openingBalance) || 0) : 0,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        startDate: startDate || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success('Staff added.');
      setName('');
      setPhone('');
      setAddress('');
      setOpeningBalance('0');
      setStartDate('');
      setNotes('');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add staff.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Add staff"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Add</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Select
          label="Who pays for this staff member's orders?"
          value={billingResponsibility}
          onChange={(event) => setBillingResponsibility(event.target.value as 'OFFICE' | 'SELF')}
        >
          <option value="OFFICE">Office pays</option>
          <option value="SELF">Staff pays personally; bill shows the office</option>
        </Select>
        <Input
          label="Opening balance (NPR)"
          type="number"
          step="0.01"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
          disabled={billingResponsibility !== 'SELF'}
          hint={
            billingResponsibility === 'SELF'
              ? 'An existing due, carried into this staff member\u2019s first personal bill.'
              : 'Only applies when the staff member pays personally.'
          }
        />
        <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}

function TransferStaffModal({
  target,
  bosses,
  onClose,
  onSaved,
}: {
  target: { staffId: string; name: string } | null;
  bosses: Array<{ _id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [bossId, setBossId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!target) return;
    if (!bossId) {
      setError('Choose a destination boss.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await khataService.transferStaff(target.staffId, bossId);
      toast.success(`${target.name} transferred.`);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not transfer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      title={target ? `Transfer ${target.name}` : 'Transfer staff'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Transfer</Button>
        </>
      }
    >
      <Select label="Destination boss" value={bossId} onChange={(e) => setBossId(e.target.value)}>
        <option value="">Select a boss…</option>
        {bosses.map((b) => (
          <option key={b._id} value={b._id}>{b.name}</option>
        ))}
      </Select>
      <p className="mt-2 text-xs text-gray-500">
        Historical transactions keep the boss they were recorded under.
      </p>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}
