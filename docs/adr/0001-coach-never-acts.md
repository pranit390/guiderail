# GuideRail never takes consequential actions for the user

Amended by [ADR 0007: Autonomy dial](0007-autonomy-dial.md): in Assist, the panel may fill the Database ID after the person's explicit Approve click; the model has no fill tool.

Guide is the default: GuideRail shows and explains, and the user performs every
click and keystroke. The approved Assist level may fill non-secret text only
after showing its plan, checking Rules and receiving explicit approval, with
readback and immediate Stop. The Firestore scope and acceptance boundary are
specified in ADR 0007; this contract alone does not claim Assist has shipped.

The user always performs consequential actions. Gemini gets no `click`,
`submit` or `send` tool. Email drafts open in a pre-filled Gmail compose URL
that the user reviews and sends. Production consoles and IAM require this
boundary: assistance must never outrun its own guard.
