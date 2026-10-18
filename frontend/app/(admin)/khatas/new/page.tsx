'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../../components/ui/Input';
import { useToast } from '../../../../providers/ToastProvider';
import { khataService } from '../../../../lib/services/khataService';
import { ApiError } from '../../../../lib/apiClient';
import type { BillingMode } from '../../../../types/api';
import { rupeesToPaisa } from '../../../../utils/money';
import { todayBusinessDate } from '../../../../utils/date';

/**
 * The 4 khata creation options (MASTER PROMPT):
 *   1. Individual                        — one person, one ledger.
 *   2. Office · Office pays directly     — billingMode DIRECT, no bosses/staff.
 *   3. Office · Bosses and staff only    — billingMode GROUPS, no office ledger.
 *   4. Office · Office + bosses + staff  — billingMode MIXED, all coexist.
 */
type CreationOption = 'INDIVIDUAL' | 'OFFICE_DIRECT' | 'OFFICE_GROUPS' | 'OFFICE_MIXED';

const OPTION_TO_INPUT: Record<CreationOption, { type: 'INDIVIDUAL' | 'OFFICE'; billingMode?: BillingMode }> = {
  INDIVIDUAL: { type: 'INDIVIDUAL' },
  OFFICE_DIRECT: { type: 'OFFICE', billingMode: 'DIRECT' },
  OFFICE_GROUPS: { type: 'OFFICE', billingMode: 'GROUPS' },
  OFFICE_MIXED: { type: 'OFFICE', billingMode: 'MIXED' },
};

interface OwnerBoss {
  name: string;
  phone: string;
  address: string;
  openingBalance: string;
}

export default function NewKhataPage() {
  const router = useRouter();
  const toast = useToast();

  const [option, setOption] = useState<CreationOption>('INDIVIDUAL');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [startDate, setStartDate] = useState(todayBusinessDate());
  const [billingStartDay, setBillingStartDay] = useState('1');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [notes, setNotes] = useState('');
  const [ownerBoss, setOwnerBoss] = useState<OwnerBoss>({
    name: '',
    phone: '',
    address: '',
    openingBalance: '0',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isOffice = option !== 'INDIVIDUAL';
  const isDirect = option === 'OFFICE_DIRECT';
  const isGroups = option === 'OFFICE_GROUPS';
  const isMixed = option === 'OFFICE_MIXED';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!displayName.trim()) {
      setError('A display name is required.');
      return;
    }
    const startDay = Number(billingStartDay);
    if (!Number.isInteger(startDay) || startDay < 1 || startDay > 28) {
      setError('Billing start day must be between 1 and 28.');
      return;
    }

    const hasBoss = isOffice && ownerBoss.name.trim() !== '';
    const officeOpeningRupees = Number(openingBalance) || 0;

    if (isDirect && hasBoss) {
      setError('A DIRECT office bills only the office itself — switch the setup to MIXED to also add bosses.');
      return;
    }
    if (isGroups && !hasBoss) {
      setError('A GROUPS office needs at least one boss — the office itself never pays. Use MIXED if the office should also pay directly.');
      return;
    }
    if (isGroups && officeOpeningRupees > 0) {
      setError('A GROUPS office has no ledger of its own — put the old due on the boss below instead.');
      return;
    }

    try {
      setSaving(true);
      const { type, billingMode } = OPTION_TO_INPUT[option];
      const result = await khataService.create({
        type,
        displayName: displayName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        startDate,
        billingStartDay: startDay,
        // GROUPS offices never carry an office-level opening.
        openingBalancePaisa: isGroups ? 0 : rupeesToPaisa(officeOpeningRupees),
        notes: notes.trim(),
        ...(type === 'OFFICE'
          ? {
              billingMode,
              defaultStaffBillingResponsibility: 'OFFICE' as const,
              initialBosses: hasBoss
                ? [
                    {
                      name: ownerBoss.name.trim(),
                      phone: ownerBoss.phone.trim() || undefined,
                      address: ownerBoss.address.trim() || undefined,
                      openingBalancePaisa: rupeesToPaisa(Number(ownerBoss.openingBalance) || 0),
                    },
                  ]
                : [],
              // Staff are added after creation, under a specific boss or in the
              // office pool (MIXED only).
              initialStaff: [],
            }
          : {}),
      });
      toast.success(`Khata ${result.khata.khataCode} created.`);
      router.replace(`/khatas/${result.khata._id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the khata.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="New khata"
        description="Create a ledger for a person, or set up an office's billing structure."
      />

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Card>
          <CardHeader
            title="Setup"
            subtitle="Pick how this khata is billed. Individuals have one ledger; offices choose who pays — the office itself, its bosses and staff, or both."
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Select
                label="Khata type"
                required
                value={option}
                onChange={(e) => setOption(e.target.value as CreationOption)}
              >
                <option value="INDIVIDUAL">1 · Individual — one person</option>
                <option value="OFFICE_DIRECT">2 · Office — office pays directly (no bosses)</option>
                <option value="OFFICE_GROUPS">3 · Office — bosses and their staff only</option>
                <option value="OFFICE_MIXED">4 · Office — office + bosses + staff</option>
              </Select>
            </div>

            <Input
              label={isOffice ? 'Office name' : 'Display name'}
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              hint={isOffice ? 'Shown on every bill for this office.' : undefined}
            />

            <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />

            <Input
              label="Start date"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="Billing start day"
              type="number"
              min={1}
              max={28}
              required
              value={billingStartDay}
              onChange={(e) => setBillingStartDay(e.target.value)}
              hint="Bills for this khata begin on this day each month (1–28)."
            />

            {isGroups ? (
              <Input
                label="Office opening balance (NPR)"
                type="number"
                step="0.01"
                value="0"
                disabled
                onChange={() => undefined}
                hint="A GROUPS office has no ledger of its own — put the old due on a boss below."
              />
            ) : (
              <Input
                label={isOffice ? 'Office opening balance (NPR)' : 'Opening balance (NPR)'}
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                hint={
                  isOffice
                    ? 'The office\'s own migrated due, carried into its first office bill. Boss dues belong on the boss below — never both.'
                    : 'An existing due carried into the first bill.'
                }
              />
            )}

            <div className="sm:col-span-2">
              <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardBody>
        </Card>

        {isOffice && !isDirect ? (
          <Card>
            <CardHeader
              title={isGroups ? 'Bosses (at least one required)' : 'Boss (optional)'}
              subtitle={
                isGroups
                  ? 'A GROUPS office bills only through its bosses and their staff. The office itself never pays.'
                  : 'The person who settles this office’s bills, if any. Leave empty when only the office pays. More bosses can be added later.'
              }
            />
            <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Boss name"
                required={isGroups}
                value={ownerBoss.name}
                onChange={(e) => setOwnerBoss((prev) => ({ ...prev, name: e.target.value }))}
              />
              <Input
                label="Phone"
                value={ownerBoss.phone}
                onChange={(e) => setOwnerBoss((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <Input
                label="Address"
                value={ownerBoss.address}
                onChange={(e) => setOwnerBoss((prev) => ({ ...prev, address: e.target.value }))}
                className="sm:col-span-2"
              />
              <Input
                label="Boss opening balance (NPR)"
                type="number"
                step="0.01"
                value={ownerBoss.openingBalance}
                onChange={(e) => setOwnerBoss((prev) => ({ ...prev, openingBalance: e.target.value }))}
                hint="Migrated due for this boss, carried into their first group bill."
                className="sm:col-span-2"
              />
              <p className="sm:col-span-2 text-xs text-gray-500">
                Staff are added after the office is created
                {isMixed ? ': under a boss who pays for them, or in the office pool with no boss.' : ', under a boss who pays for them.'}
              </p>
            </CardBody>
          </Card>
        ) : null}

        {isDirect ? (
          <Card>
            <CardHeader
              title="Office pays for everything"
              subtitle="Every order for this office is billed to the office itself — no bosses or staff ledgers. Switch to MIXED in the type selector if you also need bosses or staff later."
            />
          </Card>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Create khata
          </Button>
        </div>
      </form>
    </div>
  );
}
