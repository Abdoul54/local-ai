import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const HOME = homedir();

// Throws if the resolved path escapes the user's home directory.
export function assertInsideHome(path: string): void {
    const abs = resolve(path);
    if (!abs.startsWith(HOME + '/') && abs !== HOME) {
        throw new Error(`Access denied: path is outside home directory (${HOME})`);
    }
}

// Patterns that are unconditionally blocked regardless of arguments.
// Each entry is [pattern, reason].
const BLOCKED: [RegExp, string][] = [
    [/rm\s+-rf\s+(\/|~|\/home|\/etc|\/usr|\/var|\/boot)\b/, 'wiping critical system directories'],
    [/mkfs/, 'formatting a filesystem'],
    [/dd\s+.*of=\/dev\//, 'writing directly to a device'],
    [/>\s*\/dev\/(sd|hd|nvme|vd)/, 'writing directly to a block device'],
    [/:\(\)\{:\|:&\};:/, 'fork bomb'],
    [/shutdown|poweroff|halt|reboot/, 'shutting down the system'],
    [/chmod\s+-R\s+777\s+\//, 'chmod 777 on root'],
];

// Matches absolute paths that start outside home (e.g. /etc/passwd, /usr/bin).
const OUTSIDE_HOME = new RegExp(`(?<![\\w])(?!\\/proc\\/self)(\\/(?!${HOME.replace(/\//g, '\\/')})[a-zA-Z][\\w/.-]+)`);

export function validateCommand(command: string): void {
    for (const [pattern, reason] of BLOCKED) {
        if (pattern.test(command)) {
            throw new Error(`Blocked: ${reason}`);
        }
    }
    const outsideMatch = OUTSIDE_HOME.exec(command);
    if (outsideMatch) {
        throw new Error(`Access denied: command references path outside home directory: ${outsideMatch[1]}`);
    }
}
