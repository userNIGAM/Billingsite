'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useAuth } from '../../../providers/AuthProvider';
import { useToast } from '../../../providers/ToastProvider';
import { authService } from '../../../lib/services/authService';
import { ApiError } from '../../../lib/apiClient';

export default function SetupPage() {
  const router = useRouter();
  const { setAdmin } = useAuth();
  const toast = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const admin = await authService.setup({
        name: name.trim(),
        email: email.trim(),
        password,
        setupToken: setupToken.trim(),
      });
      setAdmin(admin);
      toast.success('Administrator account created.');
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not complete setup. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h2 className="text-sm font-semibold text-gray-900">First-run setup</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Creates the single administrator account. The setup token is the value of
          ADMIN_SETUP_TOKEN on the server.
        </p>
      </div>

      <Input
        label="Full name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        label="Email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="admin@example.com"
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Input
        label="Setup token"
        required
        value={setupToken}
        onChange={(e) => setSetupToken(e.target.value)}
      />

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <Button type="submit" loading={submitting} className="w-full">
        Create administrator
      </Button>

      <p className="text-center text-xs text-gray-500">
        Already set up? <Link href="/login" className="font-medium text-brand-700 hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
