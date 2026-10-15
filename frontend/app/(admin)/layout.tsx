'use client';

import { useAuth } from '../../providers/AuthProvider';
import { AdminShell } from '../../components/layout/AdminShell';
import { LoadingState } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { admin, authError, loading, refresh } = useAuth();

  // The middleware already redirected signed-out users; this covers the brief
  // window before `/auth/me` resolves (and the case where a stale cookie is
  // present but rejected by the API).
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message="Checking your session…" />
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-gray-900">
            {authError ? 'Could not verify your session.' : 'Your session has expired.'}
          </p>
          {authError ? (
            <>
              <p className="mt-2 text-sm text-gray-600">{authError}</p>
              <Button className="mt-3" onClick={() => void refresh()}>Retry</Button>
            </>
          ) : (
            <a href="/login" className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">
              Sign in again
            </a>
          )}
        </div>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
