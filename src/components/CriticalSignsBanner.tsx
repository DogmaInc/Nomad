'use client';

import { useState } from 'react';

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════╗
 * ║  ROD MUST REVIEW THIS COPY BEFORE LAUNCH (CLAUDE.md §2, §10.4).                   ║
 * ║  This is the clinical-adjacent text. The red-flag list below is transcribed from  ║
 * ║  §10.4 and has NOT been reviewed by anyone with veterinary training.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════╝
 *
 * The critical-signs banner (§10.4, safety invariant #7).
 *
 * Permanent and NOT dismissible. The reasoning matters: every ER triages life-threatening
 * cases first, so a critical patient sent to a farther "faster" hospital is the one way
 * this map could actively hurt an animal. The whole product ranks by total time until
 * seen — this banner is the standing exception to it.
 *
 * Recognition and routing only. No treatment advice, ever (§10.4).
 *
 * Red is used here and nowhere else in the product (§10.6).
 */

const RED_FLAGS = [
  'Trouble breathing, or blue or pale gums',
  'Collapse, or not responding to you',
  'Bleeding that will not stop',
  'A seizure lasting more than a couple of minutes, or seizures one after another',
  'Trying to vomit but nothing comes up, with a swollen or hard belly',
  'A male cat straining in the litter box and unable to urinate',
  'Swallowed something toxic',
  'Overheating or heatstroke',
  'Major injury — hit by a car, a bad fall',
  'Trouble giving birth',
];

export function CriticalSignsBanner() {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      // Not dismissible by design — there is no close control, and there should not be.
      className="border-b border-red-900/50 bg-red-950/30"
      aria-label="Emergency guidance"
    >
      {/* Compact by default. It must always be present (§10.4) but it must not eat the
          screen that holds the answer — at 2 a.m. a third of the viewport spent on a
          warning is a third not spent on where to drive. */}
      <div className="mx-auto max-w-5xl px-4 py-2.5">
        <p className="text-[13px] font-semibold leading-snug text-red-200">
          Pet critical? Go to the <strong>nearest</strong> open ER now — every ER sees
          life-threatening cases first.
        </p>

        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 text-[13px] text-red-300/90 underline underline-offset-2 hover:text-red-200"
        >
          {expanded ? 'Hide the warning signs' : 'What counts as critical?'}
        </button>

        {expanded ? (
          <div className="mt-3">
            <ul className="grid gap-1.5 text-sm text-red-100/90 sm:grid-cols-2">
              {RED_FLAGS.map((flag) => (
                <li key={flag} className="flex gap-2">
                  <span aria-hidden="true" className="text-red-400">
                    •
                  </span>
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-red-200/70">
              If you see any of these, do not compare wait times — go to the closest open
              emergency hospital and call them on the way so they can prepare.
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
