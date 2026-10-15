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
import { formatNPR } from '../../../utils/money';

export default function StaffPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [khataId, setKhataId] = useState('');
  const [status, setStatus] = useState('');
  const [addOpen, setAddOpen] = useState(false);

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
                    ) : '—'}
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
        khatas={(khatas.data ?? []).filter((k) => k.type === 'OFFICE').map((k) => ({
          _id: k._id,
          name: k.displayName,
          type: k.type,
          defaultStaffBillingResponsibility: k.defaultStaffBillingResponsibility ?? 'OFFICE',
        }))}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          staff.reload();
        }}
      />
    </div>
  );
}

function AddStaffModal({
  open,
  khatas,
  onClose,
  onSaved,
}: {
  open: boolean;
  khatas: Array<{ _id: string; name: string; type: string; defaultStaffBillingResponsibility: 'OFFICE' | 'SELF' }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [khataId, setKhataId] = useState('');
  const [bossId, setBossId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [billingResponsibility, setBillingResponsibility] = useState<'OFFICE' | 'SELF'>('OFFICE');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selected = khatas.find((k) => k._id === khataId);
  const bosses = useAsync(
    (signal) => khataService.listBosses(khataId, signal),
    [khataId],
    { enabled: Boolean(khataId) && selected?.type === 'OFFICE' }
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
    setSaving(true);
    setError('');
    try {
      await khataService.createStaff({
        khataId,
        bossId: bossId || undefined,
        name: name.trim(),
        billingResponsibility,
        phone: phone.trim() || undefined,
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
            <option key={k._id} value={k._id}>{k.name} ({k.type})</option>
          ))}
        </Select>

        {selected?.type === 'OFFICE' ? (
          <Select label="Boss" value={bossId} onChange={(e) => setBossId(e.target.value)}>
            <option value="">No boss (office-level)</option>
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
        <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}
