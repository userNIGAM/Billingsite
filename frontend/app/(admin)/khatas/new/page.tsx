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
import type { KhataType } from '../../../../types/api';
import { rupeesToPaisa } from '../../../../utils/money';
import { todayBusinessDate } from '../../../../utils/date';

interface InitialStaffRow {
  key: string;
  name: string;
  phone: string;
  billingResponsibility: 'OFFICE' | 'SELF';
}

export default function NewKhataPage() {
  const router = useRouter();
  const toast = useToast();

  const [type, setType] = useState<KhataType>('INDIVIDUAL');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [startDate, setStartDate] = useState(todayBusinessDate());
  const [billingStartDay, setBillingStartDay] = useState('1');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [notes, setNotes] = useState('');
  const [defaultStaffBillingResponsibility, setDefaultStaffBillingResponsibility] =
    useState<'OFFICE' | 'SELF'>('OFFICE');
  const [initialBossName, setInitialBossName] = useState('');
  const [initialBossPhone, setInitialBossPhone] = useState('');
  const [initialStaff, setInitialStaff] = useState<InitialStaffRow[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
    if (initialStaff.some((person) => !person.name.trim())) {
      setError('Enter a name for each staff member or remove the empty row.');
      return;
    }
    setSaving(true);
    try {
      const result = await khataService.create({
        type,
        displayName: displayName.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        startDate,
        billingStartDay: startDay,
        openingBalancePaisa: rupeesToPaisa(Number(openingBalance) || 0),
        notes: notes.trim() || undefined,
        ...(type === 'OFFICE' ? {
          defaultStaffBillingResponsibility,
          ...(initialBossName.trim()
            ? { initialBoss: { name: initialBossName.trim(), phone: initialBossPhone.trim() || undefined } }
            : {}),
          initialStaff: initialStaff.map(({ name, phone, billingResponsibility }) => ({
            name: name.trim(),
            phone: phone.trim() || undefined,
            billingResponsibility,
          })),
        } : {}),
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
      <PageHeader title="New khata" description="Create a ledger for a person or an office." />

      <form onSubmit={onSubmit} noValidate>
        <Card>
          <CardHeader
            title="Details"
            subtitle="Choose who the ledger belongs to, then set up office billing if needed."
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Type"
              required
              value={type}
              onChange={(e) => setType(e.target.value as KhataType)}
            >
              <option value="INDIVIDUAL">Individual</option>
              <option value="OFFICE">Office</option>
            </Select>

            <Input
              label="Display name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
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
              hint="Day of month each billing period opens (1–28)."
              value={billingStartDay}
              onChange={(e) => setBillingStartDay(e.target.value)}
            />

            <Input
              label="Opening balance (NPR)"
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              hint="Carried forward as a due until the first bill."
            />

            <div className="sm:col-span-2">
              <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardBody>
        </Card>

        {type === 'OFFICE' && (
          <Card className="mt-4">
            <CardHeader
              title="Office billing setup"
              subtitle="Office-paid orders stay on the office group. Self-paid staff get their own balance, with the office shown on their bill."
            />
            <CardBody className="flex flex-col gap-4">
              <Select
                label="Default for new staff"
                value={defaultStaffBillingResponsibility}
                onChange={(event) => setDefaultStaffBillingResponsibility(event.target.value as 'OFFICE' | 'SELF')}
              >
                <option value="OFFICE">Office pays staff orders</option>
                <option value="SELF">Staff pay their own orders</option>
              </Select>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Initial boss / billing group (optional)"
                  value={initialBossName}
                  onChange={(event) => setInitialBossName(event.target.value)}
                  hint="Staff added below will be assigned to this group; otherwise they use Office Direct."
                />
                <Input
                  label="Boss phone"
                  value={initialBossPhone}
                  onChange={(event) => setInitialBossPhone(event.target.value)}
                  disabled={!initialBossName.trim()}
                />
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Add staff now (optional)</h3>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setInitialStaff((rows) => [
                    ...rows,
                    {
                      key: crypto.randomUUID(),
                      name: '',
                      phone: '',
                      billingResponsibility: defaultStaffBillingResponsibility,
                    },
                  ])}
                >
                  Add staff
                </Button>
              </div>
              {initialStaff.map((person) => (
                <div key={person.key} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-[1fr,1fr,1.2fr,auto]">
                  <Input
                    label="Staff name"
                    required
                    value={person.name}
                    onChange={(event) => setInitialStaff((rows) =>
                      rows.map((row) => row.key === person.key ? { ...row, name: event.target.value } : row)
                    )}
                  />
                  <Input
                    label="Phone"
                    value={person.phone}
                    onChange={(event) => setInitialStaff((rows) =>
                      rows.map((row) => row.key === person.key ? { ...row, phone: event.target.value } : row)
                    )}
                  />
                  <Select
                    label="Who pays?"
                    value={person.billingResponsibility}
                    onChange={(event) => setInitialStaff((rows) =>
                      rows.map((row) => row.key === person.key
                        ? { ...row, billingResponsibility: event.target.value as 'OFFICE' | 'SELF' }
                        : row)
                    )}
                  >
                    <option value="OFFICE">Office pays</option>
                    <option value="SELF">Staff pays personally</option>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setInitialStaff((rows) => rows.filter((row) => row.key !== person.key))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {error ? (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
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
