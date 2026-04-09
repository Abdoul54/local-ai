import { $ } from 'bun';
import { validateCommand } from './tool-security';

export class ShellTool {
    async execute(command: string) {
        validateCommand(command);

        try {
            return await $`${{ raw: command }}`.text();
        } catch (error) {
            return `Shell Error: ${error}`;
        }
    }
}