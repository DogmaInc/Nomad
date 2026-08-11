import { redirect } from 'next/navigation';
import { isAdminConfigured, isAuthenticated } from '@/lib/admin/auth';
import { LoginForm } from '../LoginForm';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  if (!isAdminConfigured()) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-lg border border-amber-500/40 bg-amber-500/10 p-6">
        <h1 className="text-lg font-semibold">Admin is not configured</h1>
        <p className="mt-2 text-sm text-slate-300">
          Set <code className="rounded bg-slate-800 px-1.5 py-0.5">ADMIN_PASSWORD</code> and{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">ADMIN_SESSION_SECRET</code> in{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">.env.local</code>, then restart the
          dev server.
        </p>
      </div>
    );
  }

  if (await isAuthenticated()) redirect('/admin/model');

  return <LoginForm />;
}
