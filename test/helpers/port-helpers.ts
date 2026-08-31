import { spawnSync } from "bun";

export const TEST_SERVER_PORT = 3099;
export const PROTECTED_APP_PORTS = [3000, 4000] as const;

export function getTestServerPortCandidates(): number[] {
  return [TEST_SERVER_PORT];
}

/**
 * Windows branch of `killListenersOnPort` — netstat + taskkill.
 * Extracted to keep per-function sonarjs cognitive complexity within budget;
 * behavior is identical to the previous inline branch.
 */
function killWindowsListeners(port: number, selfPid: string, parentPid: string): number {
  const res = spawnSync(["cmd.exe", "/c", `netstat -ano -p tcp | findstr /R /C:":${port} "`], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const stdout = res.stdout.toString().trim();
  if (!stdout) return 0;
  const lines = stdout.split(/\r?\n/);
  const pids = new Set<string>();
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5 && parts[3] === "LISTENING") {
      const pid = parts[4];
      if (pid && pid !== "0" && pid !== selfPid && pid !== parentPid) {
        pids.add(pid);
      }
    }
  }
  for (const pid of pids) {
    spawnSync(["taskkill", "/F", "/T", "/PID", pid], { stdout: "ignore", stderr: "ignore" });
  }
  return pids.size;
}

/**
 * POSIX branch of `killListenersOnPort` — lsof + kill -9.
 * Extracted to keep per-function sonarjs cognitive complexity within budget;
 * behavior is identical to the previous inline branch.
 */
function killUnixListeners(port: number, selfPid: string, parentPid: string): number {
  const res = spawnSync(["lsof", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { stdout: "pipe", stderr: "ignore" });
  const stdout = res.stdout.toString().trim();
  if (!stdout) return 0;
  const pids = stdout.split(/\s+/).filter(pid => Boolean(pid) && pid !== selfPid && pid !== parentPid);
  for (const pid of pids) {
    spawnSync(["kill", "-9", pid], { stdout: "ignore", stderr: "ignore" });
  }
  return pids.length;
}

export function killListenersOnPort(port: number): number {
  if ((PROTECTED_APP_PORTS as readonly number[]).includes(port)) {
    return 0;
  }
  try {
    const selfPid = String(process.pid);
    const parentPid = String(process.ppid);

    if (process.platform === "win32") {
      return killWindowsListeners(port, selfPid, parentPid);
    }

    return killUnixListeners(port, selfPid, parentPid);
  } catch {
    return 0;
  }
}
