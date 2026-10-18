# GuideRail

A voice coach for Google tools that guides people through a task on the live screen, then guards the result against company policy. Guide first, guard second: the person always performs consequential actions. Guide is the default; the approved text-assistance boundary is defined in [ADR 0007](docs/adr/0007-autonomy-dial.md).

## Language

### The user's work

**Goal**:
What the user wants to achieve, in their own words.
_Avoid_: Task, request

**Journey**:
One attempt to reach a Goal, spanning tabs, apps and days.
_Avoid_: Tour, workflow, flow

**Detour**:
A sub-Journey that clears a Blocker and then returns to the main Journey.
_Avoid_: Side quest, sub-task

**Step**:
One highlighted action. In Guide, the user performs it themselves. In Assist, an approved non-secret text fill may supply a value after a plan and Rule check; all clicks and consequential actions remain human (ADR 0007).
_Avoid_: Action, instruction

**Session**:
One connected voice or text conversation; a Journey may use several.
_Avoid_: Chat, call

**Blocker**:
Something on screen that stops a Journey, such as missing permission or being signed out.
_Avoid_: Error, obstacle

### Company knowledge

**Policy**:
A human-readable company document that states how things must be done.
_Avoid_: Ruleset, guideline

**Rule**:
One requirement from a Policy, made of a guide (meaning, format, examples, suggested value) and a check (machine-verifiable condition).
_Avoid_: Validation, constraint

**Violation**:
A Rule whose check fails against what is currently on screen.
_Avoid_: Error, failure

### People

**Requester**:
The person on a Journey who hits a Blocker that someone else must clear.
_Avoid_: User (when the role matters)

**Approver**:
The person who grants what the Requester needs.
_Avoid_: Admin (when the role matters)

### Modes and knowledge

**Teach mode**:
The mode in which an expert performs a task while GuideRail records what they do and asks why, to produce a Playbook.
The side panel labels this toggle "Learn" (accessible name "Learn mode"); Teach mode stays the domain term.
_Avoid_: Record mode, expert mode, training

**Guide mode**:
The default mode in which GuideRail coaches someone through a task using published Playbooks, cited vendor documentation and Rules, without filling or clicking.
_Avoid_: Learner mode, help mode

**Assist**:
The approved level for previewed, explicitly approved non-secret text assistance, with Rule checks, readback and immediate Stop. It never clicks consequential controls. Its contract is not a claim of shipped acceptance; see ADR 0007.
_Avoid_: Autopilot, Auto

**Teach session**:
One recording of an expert performing a Goal in Teach mode, made of steps, narration and answers.
_Avoid_: Recording, capture

**Playbook**:
Published, human-readable knowledge of how the org does a task and where things are in each tool, used to guide.
_Avoid_: Skill, tour, workflow, SOP
