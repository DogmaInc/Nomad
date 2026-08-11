'use client';

import { useState, useTransition } from 'react';
import { saveModelParams, type SaveResult } from '../actions';
import type { ModelParams } from '@/lib/model/types';

/**
 * The §6.2 parameter editor.
 *
 * §4 is explicit that this must be a real working form — "a seed-script-and-redeploy cycle
 * does not pass" the gate. So every number Rod might want to move during calibration is
 * here, saves in one submit, and the inspection table above re-renders from the new values.
 */

const FACILITY_TYPES = ['er', 'er_specialty', 'urgent_care'] as const;
const DAY_CLASSES = [
  'weekday', 'friday', 'saturday', 'sunday', 'holiday', 'holiday_adjacent',
] as const;

const HOUR_NOTES: Record<number, string> = {
  0: 'skeleton overnight staffing',
  9: 'fully staffed, pre-surge — the fast window',
  17: 'after-GP-hours surge begins',
  20: 'peak evening slam',
};

export function ParamEditor({ params }: { params: ModelParams }) {
  const [result, setResult] = useState<SaveResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [openType, setOpenType] = useState<(typeof FACILITY_TYPES)[number]>('er');

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      setResult(await saveModelParams(formData));
    });
  }

  return (
    <form action={onSubmit} className="space-y-6 rounded-lg border border-slate-800 bg-slate-900/40 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Parameters (§6.2)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Structure is the contract; these numbers are knobs. Saving recomputes the table
            above immediately.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {result ? (
            <span
              role="status"
              className={`text-sm ${result.ok ? 'text-emerald-400' : 'text-rose-400'}`}
            >
              {result.message}
            </span>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save parameters'}
          </button>
        </div>
      </div>

      {/* ── base waits ──────────────────────────────────────────────────── */}
      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Base waits (minutes)
        </legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {FACILITY_TYPES.map((type) => {
            const base = params.baseWaits[type];
            return (
              <div key={type} className="rounded-md border border-slate-800 p-3">
                <p className="mb-2 text-sm text-slate-300">{type}</p>
                <div className="grid grid-cols-3 gap-2">
                  <Num name={`base.${type}.base`} label="base" defaultValue={base?.baseMinutes} />
                  <Num name={`base.${type}.min`} label="min" defaultValue={base?.minMinutes} />
                  <Num name={`base.${type}.max`} label="max" defaultValue={base?.maxMinutes} />
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* ── day multipliers ─────────────────────────────────────────────── */}
      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Day multipliers
        </legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {DAY_CLASSES.map((dayClass) => (
            <Num
              key={dayClass}
              name={`day.${dayClass}`}
              label={dayClass.replace('_', '-')}
              step="0.05"
              defaultValue={params.dayMults[dayClass]}
            />
          ))}
        </div>
      </fieldset>

      {/* ── band ratios ─────────────────────────────────────────────────── */}
      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Band ratios
        </legend>
        <p className="mt-1 text-xs text-slate-500">
          The displayed range is p50 × these. Low must be under 1 and high over 1.
        </p>
        <div className="mt-3 grid max-w-xs grid-cols-2 gap-2">
          <Num name="band.lo" label="low" step="0.05" defaultValue={params.bandLo} />
          <Num name="band.hi" label="high" step="0.05" defaultValue={params.bandHi} />
        </div>
      </fieldset>

      {/* ── hour-of-day curves ──────────────────────────────────────────── */}
      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Hour-of-day curve
        </legend>
        <div className="mt-2 flex gap-1">
          {FACILITY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setOpenType(type)}
              className={`rounded-md px-2.5 py-1 text-sm ${
                openType === type
                  ? 'bg-slate-700 text-white'
                  : 'border border-slate-700 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* All three curves stay mounted so switching tabs never discards an unsaved edit. */}
        {FACILITY_TYPES.map((type) => (
          <div
            key={type}
            hidden={openType !== type}
            className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12"
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <Num
                key={hour}
                name={`hod.${type}.${hour}`}
                label={`${String(hour).padStart(2, '0')}:00`}
                step="0.05"
                title={HOUR_NOTES[hour]}
                defaultValue={params.hodCurves[type]?.[hour]}
              />
            ))}
          </div>
        ))}
      </fieldset>
    </form>
  );
}

function Num({
  name,
  label,
  defaultValue,
  step = '1',
  title,
}: {
  name: string;
  label: string;
  defaultValue?: number;
  step?: string;
  title?: string;
}) {
  return (
    <label className="block" title={title}>
      <span className="block text-[11px] text-slate-500">{label}</span>
      <input
        type="number"
        name={name}
        step={step}
        min="0"
        defaultValue={defaultValue ?? ''}
        className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm tabular-nums text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      />
    </label>
  );
}
