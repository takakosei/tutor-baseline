# Assistant (Claude Desktop)

`mcp/server.mts` is a local MCP server (stdio) that lets Claude Desktop read and write one student's data during a chat:
log lessons, draft the line for parents, check off and add checkpoints, record grades, add lessons (including trial lessons),
mark leave and update the risk note.

Every active student automatically gets an assistant prompt: in Claude Desktop, click **+** and pick **Assistant for &lt;student&gt;**.
The new chat starts with that student's instructions and current overview. The list syncs with the database every
5 minutes (new students are added, archived ones removed), but Claude Desktop reads it only on startup; to use a student
created after startup, pick **Student assistant (pick a student)** and choose the name.

The server runs on the Mac where Claude Desktop runs and reads its password from the macOS Keychain, so it only works there.

## Safety boundaries

- Signs in with the tutor's own account, so every read and write goes through RLS and only reaches the tutor's own students
- Never uses `service_role`
- A fixed set of 9 tools: **no deletes** and no arbitrary queries
- Every write names a student and checks that the checkpoint or lesson being changed belongs to that student
- Lessons are logged with the same logic as the web app (`lib/lesson-write.ts`)
- Claude Desktop asks before each write. Keep that confirmation on for `parent_summary`: it appears directly on the parent page

## Setup

1. **Set the password** (from the repository folder; the password is never shown):

   ```bash
   mcp/setup-password.sh you@example.com
   ```

   It generates a random password, stores it in the Keychain, sets it on the Supabase account (this needs
   `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`), tries one sign-in and writes the email to `mcp/.env` (git-ignored).
   Running it again replaces the password.

2. **Register the server in Claude Desktop.** Quit Claude Desktop completely first (⌘Q): while it runs, it can rewrite
   its config file from memory and drop your edit. Then add this to `mcpServers` in
   `~/Library/Application Support/Claude/claude_desktop_config.json`:

   ```json
   "tutor-baseline": {
     "command": "/path/to/node",
     "args": [
       "/path/to/tutor-baseline/node_modules/tsx/dist/cli.mjs",
       "/path/to/tutor-baseline/mcp/server.mts"
     ]
   }
   ```

   Use absolute paths (`which node` gives the first one), then reopen Claude Desktop.

3. **Privacy.** In Claude's settings, turn off model training on your chats. The students are minors, so let parents know
   that AI is used to help organise lesson notes.

## Per-student notes

On the student's edit page in the web app, fill in **Notes for the assistant** (for example "Japanese is a second
language, so keep explanations simple"). Only the assistant reads it; parents never see it. The next assistant chat
for that student includes it.

## Example requests

- "We did today's lesson. Still stuck on reading the data tables and ran out of time again. Next time: past papers for the second-choice school."
- (drop in a photo of a marked worksheet) "Today's calculation drill, please record it."
- "Leave next Wednesday; move it to Friday 17:30–19:30."
- "The trial lesson is on 10/5 at 17:30." (always 1 hour at ¥1,000, once per student)

## Troubleshooting

- "No sign-in email set" or "The assistant password is not in the Keychain": run step 1.
- "Sign-in failed": the password was probably changed in the Supabase dashboard; run step 1 again.
- No tools in Claude Desktop: check the paths in step 2, then quit and reopen Claude Desktop.
- No student assistants under **+**: on startup the server waits at most 8 seconds for the student list, then connects
  without it. Quit and reopen Claude Desktop, or use **Student assistant (pick a student)**.
