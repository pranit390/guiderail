# Database ID assistance

Guide remains the default. Select Assist in the Firestore assistance card (shown while the
Firestore goal runs),
answer Database ID and desired security mode together, then review **What I
will do**. The plan cites Firebase, labels answers as yours, leaves location
and security mode manual, and ends **You click Create**.

Only the panel's explicit **Approve and fill Database ID** button authorizes
the exact proposed value. Chat or page instructions cannot approve a plan.
The model has no fill tool. The side panel pins the planned Database ID
element in the bound tab when the plan is created; later page reads keep that
pin, navigation drops it. No click, submit, send or fill tool is offered to
the model. Guide, Teach,
stale approvals (two minutes), changed
forms, wrong tabs and changed Journeys are refused.

The content script accepts only the original, uniquely named, visible,
editable native text input. Secret/file/custom controls and replacement or
renamed elements are refused. It uses the native value setter and input/change
events. The existing form reader verifies the value and deterministic Rules
run after each write. A rejected value gets one change/blur retry, then a
manual handoff. There is no transport replay of a failed mutation.

Planned or observed Test mode blocks Assist before filling. The planned end
state is also evaluated against loaded Rules. The production seed Rule is
owned by issue #30; the Assist boundary is recorded in
[ADR 0007](adr/0007-autonomy-dial.md).
Missing mode/location controls are not evidence that those choices were
verified. The user selects them and clicks Create themselves.

**Stop Assist** remains beside the composer, outside the scrolling cards.
It invalidates approval and queued work. Navigation, changed answers, Teach,
Journey end and disconnect also invalidate it. Already filled values remain
for manual correction; no automatic rollback is promised. A write already
dispatched to the content script may finish before Stop is received.

The Copy Database ID control remains available for manual handoff after a
field mismatch. Copy failure explicitly asks the user to type the displayed
value. This is a recovery path, not a claim that a real-console fill passed.

Candidate values that
match the existing secret masker are refused before reaching a page or relay.

## Validation boundary

`sandbox/firestore-database-id.html` is a labelled synthetic wizard step.
Behavioral tests exercise approval, native writes/readback, one retry, Rules,
Test mode, typed operation without microphone access, Stop, stale/wrong-tab
approvals, renamed/replaced/ambiguous fields, injected instructions,
secret/file controls and Guide/click refusal. Router tests exercise the
actual side-panel command boundary and bound-tab verification.

Screenshots and logs belong under the task evidence directory, outside the
repository. The captain's signed-in console is not automated. Fixture tests
and screenshots do not establish real Firebase acceptance, voice recovery,
deployed behavior or database creation.
