import { spawnSync } from "bun";

export const TEST_SERVER_PORT = 3099;
export const PROTECTED_APP_PORTS = [3000, 4000] as const;

export function getTestServerPortCandidates(): number[] {
  return [TEST_SERVER_PORT];
}

export function killListenersOnPort(port: number): number {
  if ((PROTECTED_APP_PORTS as readonly number[]).includes(port)) {
    return 0;
  }
  try {
    const res = spawnSync(["lsof", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { stdout: "pipe", stderr: "ignore" });
    const stdout = res.stdout.toString().trim();
    if (!stdout) return 0;
    const selfPid = String(process.pid);
    const parentPid = String(process.ppid);
    const pids = stdout.split(/\s+/).filter(pid => Boolean(pid) && pid !== selfPid && pid !== parentPid);
    for (const pid of pids) {
      spawnSync(["kill", "-9", pid], { stdout: "ignore", stderr: "ignore" });
    }
    return pids.length;
  } catch {
    return 0;
  }
}
