import { validateCommand, HOME } from './tool-security';

export class ShellTool {
    async execute(command: string, signal?: AbortSignal): Promise<string> {
        validateCommand(command);

        const proc = Bun.spawn(['sh', '-c', command], {
            stdout: 'pipe',
            stderr: 'pipe',
            stdin: null,
            cwd: HOME,   // working directory is always home — prevents relative path escapes
        });

        const onAbort = () => { try { proc.kill(); } catch {} };
        signal?.addEventListener('abort', onAbort, { once: true });

        try {
            const [stdout] = await Promise.all([
                new Response(proc.stdout).text(),
                proc.exited,
            ]);
            if (signal?.aborted) {
                const err = new Error('Aborted');
                err.name = 'AbortError';
                throw err;
            }
            return stdout;
        } catch (error) {
            if ((error as Error).name === 'AbortError') throw error;
            return `Shell Error: ${error}`;
        } finally {
            signal?.removeEventListener('abort', onAbort);
        }
    }
}