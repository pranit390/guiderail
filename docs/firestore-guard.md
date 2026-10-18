# Firestore Guard: practice-copy validation

This slice reuses the generic field Rules, radio `checked` value, exact-field
Violation markers and human soft guard carried to develop in commit `52ea91d`
from https://github.com/pranit390/guiderail/pull/67. It does not reproduce or
modify https://github.com/pranit390/guiderail/pull/22.

The approved seed Rule `firestore-no-test-mode` applies only to
`console.firebase.google.com/*`. It checks the exact accessible field
`Start in test mode` for `checked`. Its block message includes Firebase's
warning, “allows anyone to read and overwrite your data,” and asks the person
to choose Start in production mode. The existing red Stop marker stays at that
radio, never the wizard or Create button. Production clears this Violation.

The panel separately presents neutral vendor guidance: review location before
Create because it is permanent. Both expected security controls must be read,
with exactly one selected, before the panel reports the observed mode. Missing,
renamed, hidden or inconsistent controls are unknown, never a security pass.
The check_policy result carries this mode status as well as Violations. Hidden
wizard fields are excluded from form reads and field marker resolution.

The human soft guard holds the first click when blocking Violations are already
shown; a second click within ten seconds continues anyway. It is not a hard
security boundary and does not cover other clients or cloud changes. The guard
still depends on the panel receiving and evaluating the current form.

Sources, checked 18 October 2026:

- [Manage databases: starting security modes](https://firebase.google.com/docs/firestore/manage-databases)
- [Cloud Firestore locations](https://firebase.google.com/docs/firestore/locations)
- [ADR 0007: autonomy dial](adr/0007-autonomy-dial.md)

## Evidence boundary

The checked-in `extension/src/fixtures/firestore-configure.html` is an explicitly
labelled **practice copy** of the Configure step. Its security control names
are fixture contracts, pending a permitted real Configure-step observation.
The earlier real console probe in `firestore-console-probe.md` did not reach
Configure. No signed-in console is automated by this task. Real-dialog Test
mode Violation and actual field-name/value parity are **NOT RUN**; Firestore
runtime acceptance is not claimed.

The local tests execute the real form reader, seed Rule evaluator and overlay,
exercise Test → Production and hidden controls, and verify the existing first
click/second click override. Panel tests check the reason, safe choice, Show
field routing, location source and missing-control guidance. The server test
loads the seed via the real `/rules` HTTP endpoint. The full deterministic Rule
suite, both workspace typechecks and extension build must pass before handoff.

Browser evidence is captured from built extension bundles in a local paired
wizard/panel harness under
`/Users/ravitejkumar/.local/share/firstmate-homes/main/data/gr-t30/`.
Chrome runtime/tab APIs are fixture adapters; no model, account, actual
extension installation or real Firebase access is claimed by these captures.
Screenshots are the labelled practice-copy Guard fallback.

Assist preview, approval, fill, readback and Stop runtime acceptance belong to
the separate Assist implementation. This change specifies the contract and
keeps existing public Assist claims unchanged.
