import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { isWindows } from '../../core/platform';

export const HOME = homedir();

// Normalize to forward slashes for cross-platform path comparison.
const norm = (p: string) => p.replace(/\\/g, '/');

// Throws if the resolved path escapes the user's home directory.
export function assertInsideHome(path: string): void {
    const abs = norm(resolve(path));
    const home = norm(HOME);
    if (!abs.startsWith(home + '/') && abs !== home) {
        throw new Error(`Access denied: path is outside home directory (${HOME})`);
    }
}

// Patterns that are unconditionally blocked regardless of arguments.
const BLOCKED_UNIX: [RegExp, string][] = [
    [/rm\s+-rf\s+(\/|~|\/home|\/etc|\/usr|\/var|\/boot)\b/, 'wiping critical system directories'],
    [/mkfs/, 'formatting a filesystem'],
    [/dd\s+.*of=\/dev\//, 'writing directly to a device'],
    [/>\s*\/dev\/(sd|hd|nvme|vd)/, 'writing directly to a block device'],
    [/:\(\)\{:\|:&\};:/, 'fork bomb'],
    [/shutdown|poweroff|halt|reboot/, 'shutting down the system'],
    [/chmod\s+-R\s+777\s+\//, 'chmod 777 on root'],
];

const BLOCKED_WINDOWS: [RegExp, string][] = [
    [/Format-Volume|format\s+[a-zA-Z]:/, 'formatting a volume'],
    [/Stop-Computer|Restart-Computer|shutdown/, 'shutting down the system'],
    [/Remove-Item\s+-Recurse\s+-Force\s+[A-Z]:\\/i, 'wiping a drive root'],
];

// On Linux/WSL only: block absolute paths that escape home.
const OUTSIDE_HOME_UNIX = new RegExp(
    `(?<![\\w])(?!\\/proc\\/self)(\\/(?!${norm(HOME).replace(/\//g, '\\/')})[a-zA-Z][\\w/.-]+)`,
);

export function validateCommand(command: string): void {
    const blocked = isWindows ? BLOCKED_WINDOWS : BLOCKED_UNIX;
    for (const [pattern, reason] of blocked) {
        if (pattern.test(command)) {
            throw new Error(`Blocked: ${reason}`);
        }
    }
    if (!isWindows) {
        const outsideMatch = OUTSIDE_HOME_UNIX.exec(command);
        if (outsideMatch) {
            throw new Error(`Access denied: command references path outside home directory: ${outsideMatch[1]}`);
        }
    }
}
