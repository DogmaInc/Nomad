import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata = { title: 'Nomad admin' };

/**
 * Chrome only — deliberately NO authorisation logic.
 *
 * A layout cannot gate its children: the router renders route segments independently, so
 * a layout that swaps {children} for a login form still ships the page's data in the RSC
 * payload. Each admin page authorises itself via `requireAdmin()` / `adminDb()`, which is
 * where the check belongs (see lib/admin/auth.ts).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-[1600px] items-baseline gap-6 px-6 py-4">
          <Link href="/admin/model" className="text-sm font-semibold tracking-tight">
            Nomad <span className="text-slate-500">admin</span>
          </Link>
          <nav className="flex gap-4 text-sm text-slate-400">
            <Link href="/admin/model" className="hover:text-slate-100">
              Model
            </Link>
            <Link href="/admin/review" className="hover:text-slate-100">
              Review
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-8">{children}</main>
    </div>
  );
}
