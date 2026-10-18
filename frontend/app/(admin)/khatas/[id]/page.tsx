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
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { StatCard } from '../../../../components/ui/StatCard';
import { Table, TBody, Td, Th, THead, Tr } from '../../../../components/ui/Table';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { LoadingState } from '../../../../components/ui/Spinner';
import { useToast } from '../../../../providers/ToastProvider';
import { useAsync } from '../../../../hooks/useAsync';
import { khataService } from '../../../../lib/services/khataService';
import { ApiError } from '../../../../lib/apiClient';
import { formatNPR, rupeesToPaisa, paisaToRupees } from '../../../../utils/money';
import { formatDate, startOfMonth, todayBusinessDate } from '../../../../utils/date';

export default function KhataDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const toast = useToast();

  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayBusinessDate());

  const [editOpen, setEditOpen] = useState(false);
  const [bossOpen, setBossOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const detail = useAsync((signal) => khataService.detail(id, signal), [id]);
  const summary = useAsync((signal) => khataService.summary(id, { from, to }, signal), [id, from, to]);
  const bosses = useAsync(
    (signal) => khataService.listBosses(id, signal),
    [id],
    { enabled: detail.data?.khata.type === 'OFFICE' }
  );

  if (detail.loading) return <LoadingState message="Loading khata…" />;
  if (detail.error || !detail.data) {
    return (
      <Card>
        <EmptyState
          title="Khata not found"
          description={detail.error ?? 'It may have been removed.'}
          action={
            <Link href="/khatas">
              <Button variant="secondary">Back to khatas</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const { khata, bosses: bossRows, duePaisa, currentPeriod } = detail.data;
  const billingMode = khata.billingMode ?? (khata.type === 'OFFICE' ? 'MIXED' : null);
  const isDirectOffice = khata.type === 'OFFICE' && billingMode === 'DIRECT';
  const isGroupsOffice = khata.type === 'OFFICE' && billingMode === 'GROUPS';
  const billingModeLabel: Record<string, string> = {
    DIRECT: 'Office pays directly',
    GROUPS: 'Bosses and staff only',
    MIXED: 'Office + bosses + staff',
  };

  async function setStatus(status: 'ACTIVE' | 'OFFLINE') {
    try {
      await khataService.changeStatus(id, status);
      toast.success(status === 'ACTIVE' ? 'Khata is active again.' : 'Khata moved offline.');
      detail.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update status.');
    }
  }

  async function archive() {
    try {
      await khataService.archive(id);
      toast.success('Khata archived.');
      detail.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not archive the khata.');
    } finally {
      setConfirmArchive(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={khata.displayName}
        description={`${khata.khataCode} · ${khata.type}`}
        actions={
          <>
            <Link href={`/bills?khataId=${id}`}>
              <Button variant="secondary">Bills</Button>
            </Link>
            <Link href={`/payments?khataId=${id}`}>
              <Button variant="secondary">Payments</Button>
            </Link>
            <Link href="/khaja">
              <Button>Record khaja</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={formatNPR(duePaisa)}
          tone={duePaisa > 0 ? 'warning' : 'positive'}
        />
        <StatCard
          label={khata.type === 'OFFICE' ? 'Office opening balance' : 'Opening balance'}
          value={formatNPR(khata.openingBalancePaisa)}
          hint={
            khata.type === 'OFFICE'
              ? isGroupsOffice
                ? 'GROUPS offices have no office ledger — dues live on bosses and staff'
                : 'The office’s own ledger; boss and staff openings are on their own rows'
              : undefined
          }
        />
        <StatCard
          label="Current period"
          value={`${formatDate(currentPeriod.periodStart)} – ${formatDate(currentPeriod.periodEnd)}`}
        />
        <StatCard label="Status" value={khata.status} hint={khata.phone || 'No phone on file'} />
      </div>

      <Card>
        <CardHeader
          title="Profile"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                Edit
              </Button>
              {khata.status === 'ACTIVE' ? (
                <Button variant="secondary" size="sm" onClick={() => void setStatus('OFFLINE')}>
                  Mark offline
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => void setStatus('ACTIVE')}>
                  Reactivate
                </Button>
              )}
              <Button variant="danger" size="sm" onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
            </div>
          }
        />
        <CardBody className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <p><span className="text-gray-500">Type:</span> <Badge tone={khata.type === 'OFFICE' ? 'blue' : 'gray'}>{khata.type}</Badge></p>
          {khata.type === 'OFFICE' && billingMode ? (
            <p>
              <span className="text-gray-500">Billing mode:</span>{' '}
              <Badge tone={isDirectOffice ? 'green' : isGroupsOffice ? 'amber' : 'blue'}>
                {billingModeLabel[billingMode] ?? billingMode}
              </Badge>
            </p>
          ) : null}
          <p><span className="text-gray-500">Status:</span> <Badge tone={statusTone(khata.status)}>{khata.status}</Badge></p>
          <p><span className="text-gray-500">Start date:</span> {formatDate(khata.startDate)}</p>
          <p><span className="text-gray-500">Billing start day:</span> {khata.billingStartDay}</p>
          <p><span className="text-gray-500">Phone:</span> {khata.phone || '—'}</p>
          <p><span className="text-gray-500">Address:</span> {khata.address || '—'}</p>
          {khata.notes ? <p className="sm:col-span-2"><span className="text-gray-500">Notes:</span> {khata.notes}</p> : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Summary"
          subtitle="Accrual sales, collections, and bills for the selected range."
          action={
            <div className="flex items-end gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          }
        />
        {summary.loading ? (
          <LoadingState />
        ) : summary.error || !summary.data ? (
          <EmptyState title="Could not load the summary" description={summary.error ?? ''} />
        ) : (
          <CardBody className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Accrued sales</p>
              <p className="mt-1 font-semibold text-gray-900">{formatNPR(summary.data.accruedSalesPaisa)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Collected</p>
              <p className="mt-1 font-semibold text-gray-900">{formatNPR(summary.data.collected.totalPaisa)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Billed</p>
              <p className="mt-1 font-semibold text-gray-900">{formatNPR(summary.data.bills.billedTotalPaisa)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Outstanding</p>
              <p className="mt-1 font-semibold text-amber-700">{formatNPR(summary.data.bills.outstandingPaisa)}</p>
            </div>
          </CardBody>
        )}
      </Card>

      {khata.type === 'OFFICE' && !isDirectOffice ? (
        <Card>
          <CardHeader
            title="Bosses"
            subtitle={
              isGroupsOffice
                ? `${bossRows.length} boss${bossRows.length === 1 ? '' : 'es'} — the office itself never pays`
                : `${bossRows.length} boss${bossRows.length === 1 ? '' : 'es'}`
            }
            action={<Button size="sm" onClick={() => setBossOpen(true)}>Add boss</Button>}
          />
          {bosses.loading ? (
            <LoadingState />
          ) : bossRows.length === 0 ? (
            <EmptyState
              title="No bosses yet"
              description={
                isGroupsOffice
                  ? 'A GROUPS office bills only through its bosses and their staff — add one to start billing.'
                  : 'Add a boss who settles bills for their staff, or keep the office paying directly.'
              }
            />
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th align="right">Staff</Th>
                  <Th align="right">Due</Th>
                  <Th align="right"> </Th>
                </Tr>
              </THead>
              <TBody>
                {[...bossRows]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((b) => (
                  <Tr key={b._id}>
                    <Td>
                      <Link href={`/offices/${b._id}`} className="font-medium text-brand-700 hover:underline">
                        {b.name}
                      </Link>
                    </Td>
                    <Td><Badge tone={statusTone(b.status)}>{b.status}</Badge></Td>
                    <Td align="right">{b.staffCount ?? 0}</Td>
                    <Td align="right">{b.duePaisa != null ? formatNPR(b.duePaisa) : '—'}</Td>
                    <Td align="right">
                      {b.status === 'ACTIVE' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await khataService.deactivateBoss(b._id);
                              toast.success(`${b.name} deactivated.`);
                              bosses.reload();
                            } catch (err) {
                              toast.error(err instanceof ApiError ? err.message : 'Failed.');
                            }
                          }}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await khataService.activateBoss(b._id);
                              toast.success(`${b.name} activated.`);
                              bosses.reload();
                            } catch (err) {
                              toast.error(err instanceof ApiError ? err.message : 'Failed.');
                            }
                          }}
                        >
                          Activate
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}

      <EditKhataModal
        open={editOpen}
        khataId={id}
        isOffice={khata.type === 'OFFICE'}
        isGroups={isGroupsOffice}
        initial={{ displayName: khata.displayName, phone: khata.phone, address: khata.address, notes: khata.notes, openingBalancePaisa: khata.openingBalancePaisa }}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          detail.reload();
        }}
      />

      <AddBossModal
        open={bossOpen}
        khataId={id}
        onClose={() => setBossOpen(false)}
        onSaved={() => {
          setBossOpen(false);
          bosses.reload();
        }}
      />

      <ConfirmDialog
        open={confirmArchive}
        title="Archive this khata?"
        message="Archiving keeps all history but stops new entries and bills."
        confirmLabel="Archive"
        destructive
        onCancel={() => setConfirmArchive(false)}
        onConfirm={archive}
      />
    </div>
  );
}

function EditKhataModal({
  open,
  khataId,
  isOffice,
  isGroups,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  khataId: string;
  isOffice: boolean;
  isGroups: boolean;
  initial: { displayName: string; phone: string; address: string; notes: string; openingBalancePaisa: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [phone, setPhone] = useState(initial.phone);
  const [address, setAddress] = useState(initial.address);
  const [notes, setNotes] = useState(initial.notes);
  const [openingBalance, setOpeningBalance] = useState(String(paisaToRupees(initial.openingBalancePaisa)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      await khataService.update(khataId, {
        displayName: displayName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        notes: notes.trim(),
        // A GROUPS office has no ledger of its own; its opening stays 0.
        ...(isGroups ? {} : { openingBalancePaisa: rupeesToPaisa(Number(openingBalance) || 0) }),
      });
      toast.success('Khata updated.');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Edit khata"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="sm:col-span-2" />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input
          label={isOffice ? 'Office opening balance (NPR)' : 'Opening balance (NPR)'}
          type="number"
          step="0.01"
          value={isGroups ? '0' : openingBalance}
          disabled={isGroups}
          onChange={(e) => setOpeningBalance(e.target.value)}
          hint={
            isGroups
              ? 'A GROUPS office has no ledger of its own — dues live on bosses and staff.'
              : isOffice
                ? 'The office’s own migrated due. Edit a boss’s due on that boss.'
                : undefined
          }
        />
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} className="sm:col-span-2" />
        <div className="sm:col-span-2">
          <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}

interface BossStaffRow {
  key: string;
  name: string;
  phone: string;
  address: string;
  billingResponsibility: 'OFFICE' | 'SELF';
  openingBalance: string;
}

function AddBossModal({
  open,
  khataId,
  onClose,
  onSaved,
}: {
  open: boolean;
  khataId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [notes, setNotes] = useState('');
  const [staffRows, setStaffRows] = useState<BossStaffRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function addStaffRow() {
    setStaffRows((rows) => [
      ...rows,
      {
        key: crypto.randomUUID(),
        name: '',
        phone: '',
        address: '',
        billingResponsibility: 'OFFICE',
        openingBalance: '0',
      },
    ]);
  }

  function updateStaffRow(key: string, patch: Partial<BossStaffRow>) {
    setStaffRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeStaffRow(key: string) {
    setStaffRows((rows) => rows.filter((row) => row.key !== key));
  }

  function resetForm() {
    setName('');
    setPhone('');
    setAddress('');
    setOpeningBalance('0');
    setNotes('');
    setStaffRows([]);
    setError('');
  }

  async function save() {
    if (!name.trim()) {
      setError('A name is required.');
      return;
    }
    if (staffRows.some((row) => !row.name.trim())) {
      setError('Every staff row needs a name, or remove the empty one.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const boss = await khataService.createBoss(khataId, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        openingBalancePaisa: rupeesToPaisa(Number(openingBalance) || 0),
        notes: notes.trim() || undefined,
      });
      // Each staff is created under this boss, so it only ever belongs to them.
      for (const row of staffRows) {
        await khataService.createStaff({
          khataId,
          bossId: boss._id,
          name: row.name.trim(),
          phone: row.phone.trim() || undefined,
          address: row.address.trim() || undefined,
          billingResponsibility: row.billingResponsibility,
          openingBalancePaisa:
            row.billingResponsibility === 'SELF'
              ? rupeesToPaisa(Number(row.openingBalance) || 0)
              : 0,
        });
      }
      toast.success(
        staffRows.length > 0
          ? `Boss added with ${staffRows.length} staff.`
          : 'Boss added.'
      );
      resetForm();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the boss.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Add boss"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Add boss</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Boss name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input
          label="Opening balance (NPR)"
          type="number"
          step="0.01"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
          hint="Migrated due for this boss, carried into their first group bill."
        />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="rounded-lg border border-gray-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Staff under this boss</p>
            <Button type="button" variant="secondary" size="sm" onClick={addStaffRow} disabled={saving}>
              Add staff
            </Button>
          </div>

          {staffRows.length === 0 ? (
            <p className="text-xs text-gray-500">
              Optional — add staff now with their name, phone, address and any opening balance, or add them later from
              the boss page.
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            {staffRows.map((row, index) => (
              <div key={row.key} className="flex flex-col gap-2 rounded-md border border-gray-200 p-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,1fr,auto]">
                  <Input
                    label={`Staff ${index + 1} name`}
                    required
                    value={row.name}
                    onChange={(e) => updateStaffRow(row.key, { name: e.target.value })}
                  />
                  <Input
                    label="Phone"
                    value={row.phone}
                    onChange={(e) => updateStaffRow(row.key, { phone: e.target.value })}
                  />
                  <div className="flex items-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeStaffRow(row.key)} disabled={saving}>
                      Remove
                    </Button>
                  </div>
                </div>
                <Input
                  label="Address"
                  value={row.address}
                  onChange={(e) => updateStaffRow(row.key, { address: e.target.value })}
                />
                <div className={`grid grid-cols-1 gap-2 ${row.billingResponsibility === 'SELF' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                  <Select
                    label="Who pays for orders?"
                    value={row.billingResponsibility}
                    onChange={(e) =>
                      updateStaffRow(row.key, { billingResponsibility: e.target.value as 'OFFICE' | 'SELF' })
                    }
                  >
                    <option value="OFFICE">Boss pays (office)</option>
                    <option value="SELF">Staff pays personally</option>
                  </Select>
                  {row.billingResponsibility === 'SELF' ? (
                    <Input
                      label="Opening balance (NPR)"
                      type="number"
                      step="0.01"
                      value={row.openingBalance}
                      onChange={(e) => updateStaffRow(row.key, { openingBalance: e.target.value })}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}
