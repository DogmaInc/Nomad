'use client';

import { useState } from 'react';

/**
 * "Waiting here now?" — the owner-report control (CLAUDE.md §6.4 Tier 2).
 *
 * Rod, 2026-08-12: "explain how we the client alter the wait times, currently there is no
 * function for it." This is that function, plus the explanation of what it does — because
 * a report button with no stated effect is either ignored or assumed to do more than it
 * does.
 *
 * What it honestly does, and what the copy below says: a report cannot make a hospital look
 * faster. It can only pull an over-optimistic figure back toward the neutral estimate
 * (invariant #6). That bound is what makes an anonymous button safe to ship — the worst
 * outcome from anyone lying, in either direction, is the baseline everyone already sees.
 *
 * Structure or nothing: buckets, never free text (§13).
 */

const OPTIONS: Array<{ kind: string; bucket?: string; label: string }> = [
  { kind: 'still_waiting', bucket: 'min_30_60', label: 'Still waiting — about 30–60 min so far' },
  { kind: 'still_waiting', bucket: 'hr_1_2', label: 'Still waiting — 1–2 hours so far' },
  { kind: 'still_waiting', bucket: 'hr_2_4', label: 'Still waiting — 2–4 hours so far' },
  { kind: 'still_waiting', bucket: 'hr_4_plus', label: 'Still waiting — over 4 hours' },
  { kind: 'total_wait', bucket: 'under_30', label: 'We were seen quickly — under 30 min' },
  { kind: 'left_for_faster', label: 'We left to try a faster hospital' },
];

/** Stable per browser, meaningless on its own — the server salts and hashes it (§6.5). */
function clientToken(): string {
  const KEY = 'nomad_client_token';
  let token = localStorage.getItem(KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(KEY, token);
  }
  return token;
}

export function ReportWait({ facilityId }: { facilityId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'done' | 'error'; message?: string }>(
    { kind: 'idle' },
  );

  async function send(option: (typeof OPTIONS)[number]) {
    setState({ kind: 'sending' });
    try {
      const response = await fetch(`/api/facilities/${facilityId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: option.kind,
          bucket: option.bucket,
          clientToken: clientToken(),
        }),
      });
      const body = await response.json();
      setState(
        response.ok
          ? { kind: 'done', message: body.message ?? 'Thank you.' }
          : { kind: 'error', message: body.error ?? 'Could not send that.' },
      );
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server.' });
    }
  }

  if (state.kind === 'done') {
    return (
      <p className="mt-4 rounded-lg border border-emerald-900/60 bg-emerald-950/30 p-3 text-sm text-emerald-200">
        {state.message}
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-slate-800 pt-4">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-sky-400 underline underline-offset-2 hover:text-sky-300"
        >
          Waiting here now? Tell us how long →
        </button>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-200">How long have you waited?</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Anonymous, and it takes one tap. Reports never make a hospital look faster than
            the estimate — they only correct a figure that looks too good, so nobody can
            game this in either direction.
          </p>

          <div className="mt-3 grid gap-1.5">
            {OPTIONS.map((option) => (
              <button
                key={option.label}
                onClick={() => send(option)}
                disabled={state.kind === 'sending'}
                className="rounded-md border border-slate-700 px-3 py-2 text-left text-sm text-slate-200 hover:border-slate-500 hover:bg-slate-800/60 disabled:opacity-50"
              >
                {option.label}
              </button>
            ))}
          </div>

          {state.kind === 'error' ? (
            <p role="alert" className="mt-2 text-sm text-amber-300">
              {state.message}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
