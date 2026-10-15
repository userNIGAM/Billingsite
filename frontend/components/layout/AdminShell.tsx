'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  UtensilsCrossed,
  BookUser,
  Building2,
  Users,
  Package,
  ReceiptText,
  Wallet,
  TrendingDown,
  BarChart3,
  ScrollText,
  Settings as SettingsIcon,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuth } from '../../providers/AuthProvider';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/khaja', label: 'Khaja record', icon: UtensilsCrossed },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/khatas', label: 'Khatas', icon: BookUser },
      { href: '/offices', label: 'Offices', icon: Building2 },
      { href: '/staff', label: 'Staff', icon: Users },
      { href: '/items', label: 'Items', icon: Package },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/bills', label: 'Bills', icon: ReceiptText },
      { href: '/payments', label: 'Payments', icon: Wallet },
      { href: '/expenses', label: 'Expenses', icon: TrendingDown },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/audit-logs', label: 'Audit logs', icon: ScrollText },
      { href: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { admin, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
      {NAV_SECTIONS.map(({ label: sectionLabel, items }) => (
        <div key={sectionLabel}>
        <p className="mb-1 px-3 text-xs font-medium text-gray-500">
            {sectionLabel}
          </p>
        <div className="flex flex-col gap-0.5">
            {items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive(href) ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive(href)
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', isActive(href) ? 'text-brand-700' : 'text-gray-400 group-hover:text-gray-600')} />
                {label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-700 text-white">
            <UtensilsCrossed className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">Khaja Ghar</p>
          </div>
        </div>
        {nav}
        <div className="border-t border-gray-100 p-4">
          <div className="flex items-center gap-3 rounded-md bg-gray-50 p-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-800">
              {(admin?.name ?? 'A').trim().slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-gray-800">{admin?.name ?? 'Administrator'}</p>
              <p className="truncate text-[10px] text-gray-500">{admin?.email ?? ''}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-gray-950/35"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-gray-200 px-5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-700 text-white">
                  <UtensilsCrossed className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-gray-900">Khaja Ghar</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            <div className="border-t border-gray-100 p-4">
              <p className="truncate text-xs font-semibold text-gray-800">{admin?.name ?? 'Administrator'}</p>
              <p className="mt-0.5 truncate text-[10px] text-gray-500">{admin?.email ?? ''}</p>
              <button
                type="button"
                onClick={() => void logout()}
                className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-gray-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {/* Mobile navigation */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-gray-800">
              {NAV_SECTIONS.flatMap((section) => section.items).find((item) => isActive(item.href))?.label ?? 'Dashboard'}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">{children}</main>

        <footer className="border-t border-gray-200 px-4 py-3 text-center text-xs text-gray-400">
          Khaja Ghar · Canteen Management
        </footer>
      </div>
    </div>
  );
}
