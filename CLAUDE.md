# Village Green — project guidance

## Project board draft issues

When the user asks to **add a project draft issue** (or "add this to the
board", "make a draft issue", or similar) for the tvcri project board
(<https://github.com/orgs/tvcri/projects/1>), use the **`/add-draft-issue`**
slash command. Its instructions cover titling, field triage, and the helper
script — follow them rather than hand-writing GraphQL.

The board's backlog originates from `.claude/todo.md`. Adding a draft issue via
the command affects the **board only**; it does not edit `todo.md`. Keep
`todo.md` as the human-maintained backlog and add items there separately when
the user wants them tracked in the file too.
