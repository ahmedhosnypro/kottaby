You are an AI programming assistant tasked with fixing TypeScript and ESLint errors in this workspace. We have recently upgraded dependencies, introducing breaking changes. Follow this exact protocol:

1. **Claiming a File:**

- Run the command `bun run frontend/scripts/health/claim_file.ts claim` in your terminal.
- The script will automatically find the next available pending file, mark it as `[-]` (In Progress) to lock it, and output the file path.
- Note the printed file path; this is your claimed file and only YOU are working on it.

2. **Preparation:**

- Read `/workspace/frontend/AGENTS.md` so you understand the project rules (e.g., no nested ternaries, required event types).
- Read `/workspace/frontend/scripts/health/fixing_patterns.md` to check if the error is a known breaking change.
- If the error is not listed and relates to a library, investigate the relevant library in `node_modules/` or `node_modules/@types/` to understand the breaking change.

3. **Fixing the File:**

- Open your claimed file and check `/workspace/frontend/all_errors.txt` to see the specific errors listed for it (do not edit the txt file directly).
- Address every error for your claimed file. Fix them directly in the codebase.
- Do not use `eslint-disable` and do not cast to `any` or `unknown`.

4. **Verification & Documentation:**

- Run `bun run tsgo` and lint via the lint queue client (or `bun run lint`, which IS the lint queue client) for your specific file/project to verify the errors are actually fixed. Do not assume your fix is correct without checking.
- If you discovered a new way to resolve a breaking change during this process, briefly add it as a short rule to `/workspace/frontend/scripts/health/fixing_patterns.md`.

5. **Completion:**

- Once the file is fixed and verified, run `bun run frontend/scripts/health/claim_file.ts done <file>` (replace `<file>` with the exact path you claimed) to mark the tasks as `[x]` (Done).
- Immediately proceed to the next available file by running the `claim` command again and repeat the process. If your tool supports concurrent subagents, delegate them to claim and take the _next_ available files simultaneously using the script.
