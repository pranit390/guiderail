# GuideRail never acts for the user

GuideRail shows and explains; the user performs every click, keystroke and send. This is enforced by the tool set: Gemini gets no `click`, `type` or `send` tool, and messages are drafted by opening a pre-filled Gmail compose URL that the user sends. We chose this over an autopilot mode (as in SupaMaus and TipTour) because production consoles and IAM are exactly where enterprises won't let an AI act, and because it is our differentiator against computer-use agents.
