# Firestore read-only console probe — 2026-10-18

Scope: issues [29](https://github.com/pranit390/guiderail/issues/29) and
[25](https://github.com/pranit390/guiderail/issues/25), signed-in Chrome for
Testing, project `zoop-innovation`. Only the **first** Create database wizard
screen was authorized. It was closed with **Close form**. No database, billing,
permission or configuration action was submitted; no cookies, storage or tokens
were inspected. The browser was restored to its original extension/profile/port.

## Results

| Check | Result | Observed evidence |
| --- | --- | --- |
| Landing entry | PASS | `button: Create database`; not the docs' `Add database` |
| First wizard screen | PASS | `heading: Create a database`; `button: Select edition`; `radio: Standard edition` (checked), `radio: Enterprise edition`; `link: Compare editions (opens Firebase documentation in new tab)`; `button: Next`, `button: Close form` |
| Later section headers | Observed only | `button: Database ID and location`, `button: Configure`, `button: Scheduled backups (optional)`; these are not proof of editable fields |
| Actual Database ID and location fields | NOT RUN | Not on the authorized first screen |
| Test/Production mode and final Create | NOT RUN | Later wizard pages were not opened; full issue 25 acceptance and a Guide run reaching Create are not claimed |
| Native bound Journey and citations | PASS | 360×770 CSS pixel side panel, 10 source-heading Step links, no horizontal overflow |
| Exact edition read/highlight | PASS | Real extension `read_page` returned both named radio controls; green pointer visible around Standard edition after dismissing a promotional tooltip |
| Other active tab | PASS | Re-read paused with return-to-bound-tab message; no new `read_page` was sent |
| Missing documented target | PASS | Exact missing message and citation retained for `Databases & Storage`; the real landing uses different navigation wording |

The selected path is the narrowly authorized Firestore first-screen probe.
The full A4 checkpoint is **NOT RUN**, not a Firestore acceptance PASS. No
Cloud Run fallback was tested or claimed. Sign-in redirects were covered deterministically, not exercised on the real
account. Permission denial was not exercised during this probe.

Two actual reader/pointer defects were fixed during the probe: Material uses
transparent native radio inputs with visible painted labels, and its wizard is
inside a browser top-layer popover. The reader now recognizes the associated
visible radio label; the existing pointer mounts inside the target's overlay
surface. Hidden wizard choices remain excluded. Subsequent review repairs clear old pointers on Step transitions and End, recover overlays after transient surfaces close, and restore the shared resolver: exact normalized names first, then a unique match at confidence 0.6 or higher; ties and weaker matches are refused. These later changes were checked with synthetic browser fixtures, not repeated on the signed-in console.

## Provenance and test limits

The build used an isolated server on port 8829. The native panel invoked the
actual compiled Journey and Chrome tab binding. To honor the authorized project
scope, the QA harness intercepted `chrome.tabs.create` **only in that panel
context**, asserted that its input was the fixed catalog `project/_` URL, and
substituted `project/zoop-innovation` at the Chrome boundary. The shipped code
has no such substitution. Catalog URL selection, argument rejection, and model
tool routing are also exercised by automated tests. This is not evidence of
an uninstrumented account/project-picker journey or a voice-model end-to-end run.
Only `/project/<id>/firestore` console paths are accepted. The Firebase console
puts secondary signed-in accounts under `/u/<n>/project/...`; those paths are
unsupported and pause the Journey. The probe used a single signed-in account.

The compile was a real provider request, not the test fixture: contract v3,
`cacheHit:false`, 17,121 ms, retrieved-source metadata present. Later browser
starts reused that cache. Three initial documentation Steps were explicitly
skipped to inspect the first-screen Standard edition control; none was claimed
as completed. Promotional **Dismiss** and wizard **Close form** were the only
in-wizard buttons clicked.

Evidence lives outside the repository in
`/Users/ravitejkumar/.local/share/firstmate-homes/main/data/gr-t29/`:

- `bound-journey-citations-final.png`: native panel with current Step/citation.
- `console-edition-highlight-final.png`: real wizard and visible green pointer.
- `first-screen-final-read-page.json`: actual extension response, account name/email entry omitted.
- `native-panel-final-state.json`, `wrong-tab-proof.json`: layout, links and tab refusal.
- `compile-result.json`: actual compiler response/timing.
- `tests.txt`, `typecheck.txt`, `build.txt`: local validation output.

The branch includes the required documentation compiler dependency from
https://github.com/pranit390/guiderail/pull/45 at commit
`8523bf23efda5008ba319e131463efddddb4145e`, without modifying that pull request.
Existing generic reader, policy, permission and highlighting components were
reused; the open sibling https://github.com/pranit390/guiderail/pull/22 was not
independently modified or claimed integrated.


## Follow-up regression validation — 2026-10-18

Four independently reproduced defects were repaired after the initial probe:

- Step transitions, rereads and End clear the previous pointer without clearing policy markers or losing a recorded human click's explicit-Next eligibility.
- The shared overlay reconnects to the document when a modal/popover closes, hides or is removed. Guard, Show field and Calmer/Restore remain usable.
- The current Step, citation and progression controls sit outside the shared scrolling conversation/cards. The full template is a disclosure. The scroll/reveal controller and tests from https://github.com/pranit390/guiderail/pull/47 were integrated while preserving develop's voice, state tokens, resolver and policy behavior; that sibling remote was not modified.
- Bound Journeys use the shared unique fuzzy resolver and retain tab/project, freshness and pinned content re-resolution checks.

Local validation: 300 tests (66 server, 234 extension), both workspace typechecks, extension build and diff whitespace checks passed. Synthetic built-extension checks passed for present → Next → missing, modal pointer → End, dialog close/hide/remove, popover hide/remove, Guard and calm recovery, and actual bound-panel fuzzy success (0.9), weak-match refusal and tie refusal.

Layout passed at native 360×770 and measured 320×568 CSS pixels (device scale 2, mobile emulation on an extension tab). Streamed replies preserved manual reading position and composer focus with long simultaneous fixture cards; current controls, citation, header and composer remained visible, with no horizontal overflow. The compact screenshot is 640×1136 physical pixels. Early overrides were discarded because the helper disconnected before measuring; the successful override, measurement and capture used one DevTools session. This is compact layout proof, not a claim that Chrome's native side panel was resized to 320×568. Long cards were synthetic layout stress content.

Artifacts under the same task evidence directory: `retest/walker-proof.json`, `surfaces-proof.json`, `resolver-proof.json`, `layout-native.json`, `layout-320-verified.json`, `panel-native.png`, `panel-320-verified.png`; local logs are `followup-final-{tests,typecheck,build}.txt`. The fixture used its own Chrome profile and ports 19329/18829/18830, a local HTTPS console fixture, the retained compiler cache and a simulated Live relay. No real provider or account was exercised. The original signed-in browser was untouched. The earlier real-console evidence and its acceptance limits remain unchanged.
