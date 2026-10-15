'use client';

import { AuthProvider } from './AuthProvider';
import { ToastProvider } from './ToastProvider';

/**
 * Client-side provider stack. Kept as one component so the root layout stays a
 * server component and the ordering (toast below auth, so auth can toast) is
 * defined in exactly one place.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
