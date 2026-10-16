'use client';

import { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { LoadingState } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useToast } from '../../../providers/ToastProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { useAsync } from '../../../hooks/useAsync';
import { settingsService } from '../../../lib/services/insightService';
import { ApiError } from '../../../lib/apiClient';
import type { CanteenProfile } from '../../../types/api';
import { formatDateTime } from '../../../utils/date';

export default function SettingsPage() {
  const { admin, logout } = useAuth();

  const profile = useAsync((signal) => settingsService.getProfile(signal), []);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description="Canteen identity used on bills, and your session." />

      <Card>
        <CardHeader title="Canteen profile" subtitle="These details are saved to the database and shown on bills." />
        {profile.loading ? (
          <LoadingState />
        ) : profile.error || !profile.data ? (
          <EmptyState
            title="Could not load settings"
            description={profile.error ?? ''}
            action={<Button onClick={profile.reload}>Retry</Button>}
          />
        ) : (
          <ProfileForm initial={profile.data} onSaved={profile.reload} />
        )}
      </Card>

      <Card>
        <CardHeader title="Administrator" />
        <CardBody className="flex flex-col gap-2 text-sm">
          <p><span className="text-gray-500">Name:</span> {admin?.name ?? '—'}</p>
          <p><span className="text-gray-500">Email:</span> {admin?.email ?? '—'}</p>
          <p><span className="text-gray-500">Role:</span> {admin?.role ?? '—'}</p>
          <p><span className="text-gray-500">Last login:</span> {admin?.lastLoginAt ? formatDateTime(admin.lastLoginAt) : '—'}</p>
          <div className="mt-2">
            <Button variant="secondary" onClick={() => void logout()}>Sign out</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function ProfileForm({ initial, onSaved }: { initial: CanteenProfile; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [phone, setPhone] = useState(initial.phone);
  const [panNumber, setPanNumber] = useState(initial.panNumber ?? '');
  const [billingNote, setBillingNote] = useState(initial.billingNote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const profileIncomplete = !initial.name.trim() || !initial.address.trim() || !initial.phone.trim();

  async function save() {
    if (!name.trim() || !address.trim() || !phone.trim()) {
      setError('Canteen name, address, and phone are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await settingsService.updateProfile({
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        panNumber: panNumber.trim(),
        billingNote: billingNote.trim(),
      });
      toast.success('Settings saved.');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <CardBody>
      {profileIncomplete ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Complete the canteen name, address, and phone number so they can be used on bills.
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Canteen name" required value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
        <Input label="Address" required value={address} onChange={(e) => setAddress(e.target.value)} className="sm:col-span-2" />
        <Input label="Phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input
          label="PAN number"
          value={panNumber}
          onChange={(e) => setPanNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
          hint="Optional. Enter the 9-digit Nepal PAN registered to this business."
          inputMode="numeric"
          maxLength={9}
        />
        <Input label="Billing note" value={billingNote} onChange={(e) => setBillingNote(e.target.value)} className="sm:col-span-2" />
      </div>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
      <div className="mt-4 flex justify-end">
        <Button onClick={save} loading={saving}>Save changes</Button>
      </div>
    </CardBody>
  );
}
