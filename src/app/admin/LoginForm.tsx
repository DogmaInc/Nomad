'use client';

import { useActionState } from 'react';
import { login } from './actions';

export function LoginForm() {
  const [error, formAction, pending] = useActionState(login, null);

  return (
    <form action={formAction} className="mx-auto mt-16 max-w-sm">
      <h1 className="text-lg font-semibold">Nomad admin</h1>
      <p className="mt-1 text-sm text-slate-400">Enter the admin password to continue.</p>

      <input
        type="password"
        name="password"
        autoComplete="current-password"
        autoFocus
        required
        className="mt-6 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        placeholder="Password"
      />

      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-md bg-sky-600 px-3 py-2 font-medium text-white hover:bg-sky-500 disabled:opacity-60"
      >
        {pending ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  );
}
