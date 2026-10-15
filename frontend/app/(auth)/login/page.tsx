'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { LoadingState } from '../../../components/ui/Spinner';
import { useAuth } from '../../../providers/AuthProvider';
import { useToast } from '../../../providers/ToastProvider';
import { authService } from '../../../lib/services/authService';
import { ApiError } from '../../../lib/apiClient';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAdmin } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const nextPath = searchParams.get('next') || '/dashboard';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const admin = await authService.login({ email: email.trim(), password });
      setAdmin(admin);
      toast.success(`Welcome back, ${admin.name}.`);
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.statusCode === 429
            ? 'Too many attempts. Please wait a few minutes and try again.'
            : err.message
          : 'Could not sign in. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Sign in</h2>
        <p className="mt-0.5 text-xs text-gray-500">Use your administrator account.</p>
      </div>

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
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <Button type="submit" loading={submitting} className="w-full">
        Sign in
      </Button>

      <p className="text-center text-xs text-gray-500">
        First time here? <Link href="/setup" className="font-medium text-brand-700 hover:underline">Create the admin account</Link>
      </p>
    </form>
  );
}
