'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { Badge, statusTone } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/ui/EmptyState';
import { LoadingState } from '../../../components/ui/Spinner';
import { Textarea } from '../../../components/ui/Input';
import { useToast } from '../../../providers/ToastProvider';
import { useAsync } from '../../../hooks/useAsync';
import { useDebounced } from '../../../hooks/useDebounce';
import { khataService } from '../../../lib/services/khataService';
import { ApiError } from '../../../lib/apiClient';
import { formatDate } from '../../../utils/date';
import { formatNPR, rupeesToPaisa } from '../../../utils/money';

export default function StaffPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [khataId, setKhataId] = useState('');
  const [status, setStatus] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [transferStaff, setTransferStaff] = useState<{ _id: string; name: string; khataId: string } | null>(null);

  const khatas = useAsync((signal) => khataService.listAll({}, signal), []);

  const staff = useAsync(
    (signal) =>
      khataService.listStaff(
        {
          q: debouncedQ.trim() || undefined,
          khataId: khataId || undefined,
          status: status === 'ACTIVE' || status === 'INACTIVE' ? status : undefined,
        },
        signal
      ),
    [debouncedQ, khataId, status]
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Staff"
        description="Manage office staff and choose whether the office or each staff member pays."
        actions={<Button onClick={() => setAddOpen(true)}>Add staff</Button>}
      />

      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <Input
            label="Search"
            placeholder="Name or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select label="Khata" value={khataId} onChange={(e) => setKhataId(e.target.value)}>
            <option value="">All khatas</option>
            {(khatas.data ?? []).map((k) => (
              <option key={k._id} value={k._id}>{k.displayName}</option>
            ))}
          </Select>
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </div>

        {staff.loading ? (
          <LoadingState />
        ) : staff.error ? (
          <EmptyState title="Could not load staff" description={staff.error} action={<Button onClick={staff.reload}>Retry</Button>} />
        ) : (staff.data ?? []).length === 0 ? (
          <EmptyState title="No staff found" description="Add staff to an office khata." />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Boss</Th>
                <Th>Billing</Th>
                <Th align="right">Outstanding</Th>
                <Th>Status</Th>
                <Th>Started</Th>
                <Th align="right"> </Th>
              </Tr>
            </THead>
            <TBody>
              {(staff.data ?? []).map((s) => (
                <Tr key={s._id}>
                  <Td className="font-medium text-gray-900">{s.name}</Td>
                  <Td>{s.phone || '—'}</Td>
                  <Td>
                    {s.bossId ? (
                      <Link href={`/offices/${s.bossId}`} className="text-brand-700 hover:underline">
                        {s.bossName ?? s.bossId}
                      </Link>
                    ) : (
                      <Badge tone="gray">Office pool</Badge>
                    )}
                  </Td>
                  <Td>{s.billingResponsibility === 'SELF' ? 'Staff pays' : 'Office pays'}</Td>
                  <Td align="right">{s.billingResponsibility === 'SELF' ? formatNPR(s.duePaisa ?? 0) : '—'}</Td>
                  <Td><Badge tone={statusTone(s.status)}>{s.status}</Badge></Td>
                  <Td>{formatDate(s.startDate)}</Td>
                  <Td align="right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          const next = s.billingResponsibility === 'SELF' ? 'OFFICE' : 'SELF';
                          await khataService.updateStaff(s._id, { billingResponsibility: next });
                          toast.success(`Future orders for ${s.name} will be ${next === 'SELF' ? 'staff-paid' : 'office-paid'}.`);
                          staff.reload();
                        } catch (err) {
                          toast.error(err instanceof ApiError ? err.message : 'Could not change billing responsibility.');
                        }
                      }}
                    >
                      Change billing
                    </Button>
                    {s.billingResponsibility === 'SELF' ? (
                      <>
                        <Link href={`/bills?khataId=${s.khataId}&staffId=${s._id}`}>
                          <Button variant="ghost" size="sm">Bills</Button>
                        </Link>
                        <Link href={`/payments?khataId=${s.khataId}&staffId=${s._id}`}>
                          <Button variant="ghost" size="sm">Payments</Button>
                        </Link>
                      </>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTransferStaff({ _id: s._id, name: s.name, khataId: s.khataId })}
                    >
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
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <AddStaffModal
        open={addOpen}
        khatas={(khatas.data ?? [])
          .filter((k) => k.type === 'OFFICE' && (k.billingMode ?? 'MIXED') !== 'DIRECT')
          .map((k) => ({
            _id: k._id,
            name: k.displayName,
            billingMode: k.billingMode ?? 'MIXED',
            defaultStaffBillingResponsibility: k.defaultStaffBillingResponsibility ?? 'OFFICE',
          }))}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          staff.reload();
        }}
      />

      {transferStaff ? (
        <TransferStaffModal
          staff={transferStaff}
          onClose={() => setTransferStaff(null)}
          onSaved={() => {
            setTransferStaff(null);
            staff.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function TransferStaffModal({
  staff,
  onClose,
  onSaved,
}: {
  staff: { _id: string; name: string; khataId: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [bossId, setBossId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const detail = useAsync((signal) => khataService.detail(staff.khataId, signal), [staff.khataId]);
  const bosses = useAsync((signal) => khataService.listBosses(staff.khataId, signal), [staff.khataId]);
  const billingMode = detail.data?.khata.billingMode ?? 'MIXED';

  async function save() {
    setSaving(true);
    setError('');
    try {
      await khataService.transferStaff(staff._id, bossId || null);
      toast.success(
        bossId
          ? `${staff.name} transferred. Past bills keep the old boss; new orders bill the new one.`
          : `${staff.name} moved to the office pool. Past bills keep the old boss.`
      );
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not transfer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`Transfer ${staff.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Transfer</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label="New boss" value={bossId} onChange={(e) => setBossId(e.target.value)}>
          <option value="">Office pool (no boss — office pays)</option>
          {(bosses.data ?? []).map((b) => (
            <option key={b._id} value={b._id}>{b.name}</option>
          ))}
        </Select>
        {billingMode === 'GROUPS' && !bossId ? (
          <p className="text-xs text-amber-700">
            This office bills only through bosses — staff in the office pool cannot order until moved to a boss.
          </p>
        ) : null}
        <p className="text-xs text-gray-500">
          Existing bills and payments keep their original boss. Only future orders use the new assignment.
        </p>
      </div>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}

function AddStaffModal({
  open,
  khatas,
  onClose,
  onSaved,
}: {
  open: boolean;
  khatas: Array<{
    _id: string;
    name: string;
    billingMode: string;
    defaultStaffBillingResponsibility: 'OFFICE' | 'SELF';
  }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [khataId, setKhataId] = useState('');
  const [bossId, setBossId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [billingResponsibility, setBillingResponsibility] = useState<'OFFICE' | 'SELF'>('OFFICE');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selected = khatas.find((k) => k._id === khataId);
  const isGroups = selected?.billingMode === 'GROUPS';
  const bosses = useAsync(
    (signal) => khataService.listBosses(khataId, signal),
    [khataId],
    { enabled: Boolean(khataId) }
  );

  async function save() {
    if (!khataId) {
      setError('Choose a khata.');
      return;
    }
    if (!name.trim()) {
      setError('A name is required.');
      return;
    }
    if (isGroups && !bossId) {
      setError('A GROUPS office bills only through its bosses — pick a boss for this staff member.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await khataService.createStaff({
        khataId,
        bossId: bossId || undefined,
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
        <Select
          label="Khata"
          required
          value={khataId}
          onChange={(e) => {
            const nextKhataId = e.target.value;
            setKhataId(nextKhataId);
            setBossId('');
            setBillingResponsibility(
              khatas.find((khata) => khata._id === nextKhataId)?.defaultStaffBillingResponsibility ?? 'OFFICE'
            );
          }}
        >
          <option value="">Select a khata…</option>
          {khatas.map((k) => (
            <option key={k._id} value={k._id}>{k.name}</option>
          ))}
        </Select>

        {selected ? (
          <Select
            label="Boss"
            required={isGroups}
            value={bossId}
            onChange={(e) => setBossId(e.target.value)}
          >
            <option value="">
              {isGroups ? 'Pick a boss…' : 'Office pool (no boss — office pays)'}
            </option>
            {(bosses.data ?? []).map((b) => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </Select>
        ) : null}

        <Select
          label="Who pays for this staff member's orders?"
          value={billingResponsibility}
          onChange={(e) => setBillingResponsibility(e.target.value as 'OFFICE' | 'SELF')}
        >
          <option value="OFFICE">Office pays; balance goes to the office group</option>
          <option value="SELF">Staff pays; separate balance, bill shows the office</option>
        </Select>

        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
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
