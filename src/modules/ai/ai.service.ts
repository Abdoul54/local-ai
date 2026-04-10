import { createOllama } from 'ollama-ai-provider-v2';
import { stepCountIs, streamText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { createTools } from './tools.registry';
import { assistantLabel, thinkingLabel, infoMessage, debugLine, createSpinner, createStreamingRenderer, renderElapsed } from '../chat/cli-ui';

export type ConfirmFn = (toolName: string, description: string) => Promise<boolean>;
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

    private buildRequest(messages: ModelMessage[], thinking: boolean, confirm?: ConfirmFn) {
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
                        `You are ${config.user.name}'s personal AI assistant with access to the local filesystem and shell (home directory only).\n` +
                        `Current working directory: ${process.cwd()}\n\n` +
                        'Guidelines:\n' +
                        '- Always use absolute paths when referring to specific locations.\n' +
                        '- To find files by name use the search tool with type "name".\n' +
                        '- To find files by content use the search tool with type "content".\n' +
                        '- Use the shell tool for operations not covered by other tools.\n' +
                        '- Never ask the user to run a command for you. Always use the tools to get the information yourself.\n' +
                        '- Never ask clarifying questions when you can find the answer by using a tool.\n' +
                        '- Act immediately with sensible defaults. Do not ask for information that can be reasonably assumed.\n' +
                        '- If you genuinely need missing information, ask everything in ONE single question — never ask one thing at a time across multiple turns.\n' +
                        '- ALWAYS print tool results directly. Never say "I listed it" or "I found X" — show the actual output.\n' +
                        '- When listing files or search results, print every item. Never truncate or summarize the list.\n' +
                        '- After completing a task, respond in one short sentence. Do not over-explain.' +
                        toolsNote,
                },
                ...messages,
            ],
            stopWhen: stepCountIs(config.chat.maxSteps),
            tools: {
                directory: tool({
                    description: 'List files and folders inside the user\'s home directory. Path must be inside home.',
                    inputSchema: z.object({ path: z.string().default('~').describe('Directory to list. Must be inside home.') }),
                    execute: async ({ path }, { abortSignal }) => AIService.abortable(this.appTools.directory.list(path), abortSignal),
                }),
                file: tool({
                    description: 'Read the contents of a file. Path must be inside the user\'s home directory.',
                    inputSchema: z.object({ path: z.string() }),
                    execute: async ({ path }, { abortSignal }) => AIService.abortable(this.appTools.file.read(path), abortSignal),
                }),
                search: tool({
                    description: 'Search inside the user\'s home directory. ' +
                        'type="name" finds files/dirs by name pattern (e.g. "*.ts", "config"). ' +
                        'type="content" finds files containing a text/regex pattern and returns matching lines with line numbers. ' +
                        'fileType filters name searches to "file", "dir", or "any".',
                    inputSchema: z.object({
                        pattern:  z.string().describe('Filename pattern or text/regex to search for.'),
                        rootPath: z.string().optional().describe('Subdirectory to search in (must be inside home). Defaults to home root.'),
                        type:     z.enum(['name', 'content']),
                        fileType: z.enum(['file', 'dir', 'any']).default('any').describe('For name searches only.'),
                        maxResults: z.number().default(30),
                    }),
                    execute: async ({ pattern, rootPath, type, fileType, maxResults }, { abortSignal }) => {
                        const p = type === 'name'
                            ? this.appTools.search.byName(pattern, rootPath, fileType, maxResults)
                            : this.appTools.search.byContent(pattern, rootPath, maxResults);
                        return AIService.abortable(p, abortSignal);
                    },
                }),
                shell: tool({
                    description: 'Execute any shell command on the local system.',
                    inputSchema: z.object({ command: z.string() }),
                    execute: async ({ command }, { abortSignal }) => {
                        if (confirm) {
                            const allowed = await confirm('shell', command);
                            if (!allowed) return 'Permission denied by user.';
                        }
                        return this.appTools.shell.execute(command, abortSignal);
                    },
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

    async warmup(): Promise<void> {
        try {
            const result = streamText({
                model: ollama(config.ollama.model),
                messages: [{ role: 'user' as const, content: '.' }],
                maxOutputTokens: 1,
            });
            // Fully consume the stream — ensures the model is completely loaded.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _ of result.textStream) { /* drain */ }
        } catch {
            // Warmup is best-effort; ignore errors.
        }
    }

    async generate(messages: ModelMessage[], signal?: AbortSignal, externalConfirm?: ConfirmFn): Promise<string> {
        const spinner = createSpinner();
        const startedAt = Date.now();

        // Wrap external confirm so the spinner pauses while waiting for user input.
        // The spinner auto-resumes when the AI SDK emits the next tool-result event.
        const confirm: ConfirmFn | undefined = externalConfirm
            ? async (toolName, description) => {
                spinner.stop();
                const result = await externalConfirm(toolName, description);
                spinner.resume();
                return result;
            }
            : undefined;

        if (config.chat.debug) {
            const req = this.buildRequest(messages, config.chat.thinking, confirm);
            const promptChars = (req.messages as Array<{ content: string }>)
                .reduce((n, m) => n + (m.content?.length ?? 0), 0);
            process.stdout.write(debugLine(
                `model: ${config.ollama.model}  messages: ${messages.length}  prompt: ${promptChars} chars`
            ) + '\n');
        }

        spinner.start();

        try {
            const result = streamText({ ...this.buildRequest(messages, config.chat.thinking, confirm), abortSignal: signal });
            return await this.runStream(result, spinner, startedAt);
        } catch (err) {
            if (config.chat.thinking && isThinkingUnsupported(err)) {
                spinner.stop();
                process.stdout.write('\n' + infoMessage('  Model does not support thinking — retrying without it.\n\n'));
                spinner.start();
                const result = streamText({ ...this.buildRequest(messages, false, confirm), abortSignal: signal });
                return await this.runStream(result, spinner, startedAt);
            }
            throw err;
        }
    }
}
