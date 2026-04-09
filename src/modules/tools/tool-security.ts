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

export function validateCommand(command: string): void {
    for (const [pattern, reason] of BLOCKED) {
        if (pattern.test(command)) {
            throw new Error(`Blocked: ${reason}`);
        }
    }
}
