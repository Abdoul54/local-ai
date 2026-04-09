import { createOllama } from 'ollama-ai-provider-v2';
import { stepCountIs, streamText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { createTools } from './tools.registry';
import { assistantLabel, thinkingLabel, infoMessage, debugLine, createSpinner, createStreamingRenderer, renderElapsed } from '../chat/cli-ui';
import { config } from '../../core/config';

const isWSL = (() => {
    try {
        return /microsoft|wsl/i.test(readFileSync('/proc/version', 'utf-8'));
    } catch {
        return false;
    }
})();

const ollama = createOllama({
    baseURL: config.ollama.baseURL,
});

function toolStatusLine(toolName: string, input: Record<string, unknown>): string {
    const truncate = (s: string, n = 60) => s.length > n ? s.slice(0, n) + '…' : s;
    switch (toolName) {
        case 'shell':     return `running: ${truncate(String(input.command ?? ''))}`;
        case 'file':      return `reading: ${input.path}`;
        case 'directory': return `listing: ${input.path}`;
        case 'search':    return `searching ${input.type === 'content' ? 'content' : 'name'}: ${input.pattern} in ${input.rootPath}`;
        default:          return `${toolName}…`;
    }
}

function isThinkingUnsupported(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const body = (err as unknown as Record<string, string>).responseBody ?? '';
    return (err.message + body).includes('does not support thinking');
}

export class AIService {
    private readonly appTools;

    constructor(private readonly availableTools: string[] = []) {
        this.appTools = createTools(availableTools);
    }

    private static abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
        if (!signal) return promise;
        if (signal.aborted) return Promise.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        return new Promise((resolve, reject) => {
            const onAbort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            signal.addEventListener('abort', onAbort, { once: true });
            promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
        });
    }

    private buildRequest(messages: ModelMessage[], thinking: boolean) {
        const toolsNote = this.availableTools.length > 0
            ? '\nYou have access to a full shell with many tools available.'
            : '';
        const windowsDrivesLine = isWSL ? '- Windows drives: /mnt/c, /mnt/d, etc.\n' : '';

        return {
            model: ollama(config.ollama.model),
            ...(thinking && { providerOptions: { ollama: { think: true } } }),
            messages: [
                {
                    role: 'system' as const,
                    content: config.chat.systemPrompt ??
                        `You are ${config.user.name}'s personal AI assistant with full access to the local filesystem and shell.\n` +
                        'You can freely navigate and read anywhere on the system:\n' +
                        '- Linux filesystem: /, /home, /etc, /var, /tmp, /opt, /usr, etc.\n' +
                        windowsDrivesLine +
                        '- Current working directory: use "." or omit the path\n\n' +
                        'Guidelines:\n' +
                        '- Always use absolute paths when referring to specific locations.\n' +
                        '- To find files by name use the search tool with type "name".\n' +
                        '- To find files by content use the search tool with type "content".\n' +
                        '- For directory listings, list names only — omit "." and ".." unless asked.\n' +
                        '- Use the shell tool for operations not covered by other tools.\n' +
                        '- Do not ask clarifying questions when you can explore and find the answer directly.' +
                        toolsNote,
                },
                ...messages,
            ],
            stopWhen: stepCountIs(config.chat.maxSteps),
            tools: {
                directory: tool({
                    description: `List files and folders at any path on the filesystem. Use absolute paths (e.g. /home/user, /etc${isWSL ? ', /mnt/c/Users' : ''}) or "." for the current directory.`,
                    inputSchema: z.object({ path: z.string().default('.') }),
                    execute: async ({ path }, { abortSignal }) => AIService.abortable(this.appTools.directory.list(path), abortSignal),
                }),
                file: tool({
                    description: 'Read the contents of any file on the filesystem using its absolute path.',
                    inputSchema: z.object({ path: z.string() }),
                    execute: async ({ path }, { abortSignal }) => AIService.abortable(this.appTools.file.read(path), abortSignal),
                }),
                search: tool({
                    description: 'Search the filesystem. Use type "name" to find files by filename pattern (supports wildcards like *.ts), or type "content" to find files containing a text pattern.',
                    inputSchema: z.object({
                        rootPath: z.string().default('/').describe('Directory to search in. Use / for the whole filesystem.'),
                        pattern: z.string().describe('Filename glob (e.g. "*.env") for name search, or text/regex for content search.'),
                        type: z.enum(['name', 'content']),
                        maxResults: z.number().default(30),
                    }),
                    execute: async ({ rootPath, pattern, type, maxResults }, { abortSignal }) => {
                        const p = type === 'name'
                            ? this.appTools.search.byName(rootPath, pattern, maxResults)
                            : this.appTools.search.byContent(rootPath, pattern, maxResults);
                        return AIService.abortable(p, abortSignal);
                    },
                }),
                shell: tool({
                    description: 'Execute any shell command on the local system.',
                    inputSchema: z.object({ command: z.string() }),
                    execute: async ({ command }, { abortSignal }) => this.appTools.shell.execute(command, abortSignal),
                }),
            },
        };
    }

    private async runStream(
        result: { fullStream: AsyncIterable<any> },
        spinner: ReturnType<typeof createSpinner>,
        startedAt: number,
    ): Promise<string> {
        let full = '';
        const renderer = createStreamingRenderer();
        let started = false;
        let reasoning = false;
        let ttftLogged = false;
        let finishDebugLine: string | null = null;

        for await (const chunk of result.fullStream) {
            if (chunk.type === 'tool-call') {
                spinner.update(toolStatusLine(chunk.toolName, chunk.input as Record<string, unknown>));
            } else if (chunk.type === 'tool-result') {
                spinner.update('thinking…');
            } else if (chunk.type === 'reasoning-delta') {
                if (!reasoning) {
                    if (config.chat.debug && !ttftLogged) {
                        ttftLogged = true;
                        process.stdout.write('\n' + debugLine(`TTFT: ${((Date.now() - startedAt) / 1000).toFixed(2)}s`) + '\n');
                    }
                    spinner.stop();
                    process.stdout.write(thinkingLabel() + '\n');
                    reasoning = true;
                }
                process.stdout.write(chunk.text);
            } else if (chunk.type === 'text-delta') {
                if (!started) {
                    if (config.chat.debug && !ttftLogged) {
                        ttftLogged = true;
                        process.stdout.write('\n' + debugLine(`TTFT: ${((Date.now() - startedAt) / 1000).toFixed(2)}s`) + '\n');
                    }
                    if (reasoning) process.stdout.write('\n');
                    spinner.stop();
                    process.stdout.write(assistantLabel() + '\n');
                    started = true;
                }
                full += chunk.text;
                renderer.write(chunk.text);
            } else if (chunk.type === 'finish' && config.chat.debug) {
                const u = chunk.totalUsage;
                const elapsed = (Date.now() - startedAt) / 1000;
                const rate = u?.outputTokens != null ? (u.outputTokens / elapsed).toFixed(1) : '?';
                finishDebugLine = [
                    u?.inputTokens  != null ? `in: ${u.inputTokens}`  : null,
                    u?.outputTokens != null ? `out: ${u.outputTokens}` : null,
                    `${rate} tok/s`,
                ].filter(Boolean).join('  ');
            }
        }

        if (!started && !reasoning) spinner.stop();
        renderer.flush();
        if (finishDebugLine) process.stdout.write(debugLine(finishDebugLine) + '\n');
        process.stdout.write(renderElapsed(Date.now() - startedAt) + '\n');

        return full;
    }

    async generate(messages: ModelMessage[], signal?: AbortSignal): Promise<string> {
        const spinner = createSpinner();
        const startedAt = Date.now();

        if (config.chat.debug) {
            const req = this.buildRequest(messages, config.chat.thinking);
            const promptChars = (req.messages as Array<{ content: string }>)
                .reduce((n, m) => n + (m.content?.length ?? 0), 0);
            process.stdout.write(debugLine(
                `model: ${config.ollama.model}  messages: ${messages.length}  prompt: ${promptChars} chars`
            ) + '\n');
        }

        spinner.start();

        try {
            const result = streamText({ ...this.buildRequest(messages, config.chat.thinking), abortSignal: signal });
            return await this.runStream(result, spinner, startedAt);
        } catch (err) {
            if (config.chat.thinking && isThinkingUnsupported(err)) {
                spinner.stop();
                process.stdout.write('\n' + infoMessage('  Model does not support thinking — retrying without it.\n\n'));
                spinner.start();
                const result = streamText({ ...this.buildRequest(messages, false), abortSignal: signal });
                return await this.runStream(result, spinner, startedAt);
            }
            throw err;
        }
    }
}
