-- Add `not_emergency` to facility_status.
--
-- The review queue needs a way to say "this is a real, open, correctly-listed veterinary
-- practice that simply is not an emergency facility". The existing values cannot express
-- that without lying:
--   * closed_permanently — false; the practice is open and seeing patients
--   * duplicate          — false; it is a distinct facility
--   * needs_review       — would resurface it in the queue forever
--
-- §7 says never hard-delete, so the row and its provenance stay. This status keeps it out
-- of the map and out of the queue while recording WHY, which is also the training signal
-- for improving the classifier: every not_emergency row is a case the importer got wrong.
--
-- `facility_flags.kind` already uses the same term for the crowd-reported version of this
-- judgement, so the vocabulary is consistent.

alter type facility_status add value if not exists 'not_emergency';
