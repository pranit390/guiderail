# GuideRail

A voice coach for Google tools that guides people through a task on the live screen, then guards the result against company policy. Guide first, guard second: it never acts for the user.

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
One highlighted action the user performs themselves.
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
_Avoid_: Record mode, expert mode, training

**Guide mode**:
The mode in which GuideRail coaches someone through a task using published Playbooks and Rules.
_Avoid_: Learner mode, help mode

**Teach session**:
One recording of an expert performing a Goal in Teach mode, made of steps, narration and answers.
_Avoid_: Recording, capture

**Playbook**:
Published, human-readable knowledge of how the org does a task and where things are in each tool, used to guide.
_Avoid_: Skill, tour, workflow, SOP
