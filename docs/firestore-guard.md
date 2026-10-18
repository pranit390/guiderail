# Firestore Guard: practice-copy validation

This slice reuses the generic field Rules, radio `checked` value, exact-field
Violation markers and human soft guard carried to develop in commit `52ea91d`
from https://github.com/pranit390/guiderail/pull/67. It does not reproduce or
modify https://github.com/pranit390/guiderail/pull/22.

The approved seed Rule `firestore-no-test-mode` applies only to
`console.firebase.google.com/*`. It checks the exact accessible field
`Start in test mode` for `checked`; field Rules match accessible names
case-insensitively with whitespace collapsed. Its block message includes
Firebase's warning, “allows anyone to read and overwrite your data,” and asks
the person to choose Start in Production mode. The existing red Stop marker stays at that
radio, never the wizard or Create button. Production clears this Violation.

The panel separately presents neutral vendor guidance: review location before
Create because it is permanent. It shows this card only while the create wizard
is open (either security radio is read, or the `Create a database` dialog is
visible); other Firestore pages show nothing. Both expected security controls
must be read, with exactly one selected, before the panel reports the observed
mode. Missing, renamed, hidden or inconsistent controls inside the wizard are
unknown, never a security pass. Hidden wizard fields are excluded from form
reads and field marker resolution.

The human soft guard holds the first click when blocking Violations are already
shown; a second click within ten seconds continues anyway. It is not a hard
security boundary and does not cover other clients or cloud changes. The guard
still depends on the panel receiving and evaluating the current form.

Sources, checked 18 October 2026:

- [Manage databases: starting security modes](https://firebase.google.com/docs/firestore/manage-databases)
- [Cloud Firestore locations](https://firebase.google.com/docs/firestore/locations)
- [ADR 0007: autonomy dial](adr/0007-autonomy-dial.md)

## Evidence boundary

A captain screenshot of the real console's Configure step (18 October 2026)
shows the options `Start in Production mode` and `Start in test mode` under a
`Create a database` dialog heading. The checked-in
`extension/src/fixtures/firestore-configure.html` is an explicitly labelled
**practice copy** of that step using those observed labels. No signed-in
console is automated by this task. The live-console Test mode Violation run is
**pending the captain's demo run**; Firestore runtime acceptance is not yet
claimed.

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

Local validation result: **437 tests passed** (125 server, 312 extension), both
workspace typechecks passed, and the extension build passed. The direct isolated
Chrome for Testing capture passed: Test mode produced one Stop marker and the
panel's block reason; Production produced zero markers and hid the Violation.
The 360px panel had no horizontal overflow in the 1300×900 paired harness.
Artifacts: `test-mode-practice-copy.png`, `production-mode-practice-copy.png`,
`test-mode-proof.json`, `production-mode-proof.json`, and `browser/capture.mjs`
in that evidence directory. The owned browser was closed after capture. These
results remain practice-copy evidence only.
