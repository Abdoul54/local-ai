const BLOCKED_COMMANDS = [
    'rm -rf',
    'shutdown',
    'reboot',
    'mkfs',
    'format',
    'del /f',
    ':(){:|:&};:',
];

export function validateCommand(command: string) {
    for (const blocked of BLOCKED_COMMANDS) {
        if (command.toLowerCase().includes(blocked)) {
            throw new Error(`Blocked dangerous command: ${blocked}`);
        }
    }
}