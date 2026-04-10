import { config } from "../../core/config";

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const BLUE = '\x1b[34m';

const CONTENT_INDENT = '     ';
const CODE_INDENT = '       ';
const CODE_SEPARATOR = `${CONTENT_INDENT}${'─'.repeat(44)}`;

function colorize(text: string, color: string) {
    return `${color}${text}${RESET}`;
}

function terminalWidth() {
    return Math.max(60, process.stdout.columns ?? 80);
}

function renderInlineMarkdown(text: string): string {
    return text
        .replace(/\*\*(.*?)\*\*/g, `${BOLD}$1${RESET}`)
        .replace(/__(.*?)__/g, `${BOLD}$1${RESET}`)
        .replace(/\*([^*\n]+)\*/g, `${ITALIC}$1${RESET}`)
        .replace(/_([^_\n]+)_/g, `${ITALIC}$1${RESET}`)
        .replace(/`([^`\n]+)`/g, `${BLUE}$1${RESET}`);
}

function wrapText(text: string, width: number, firstIndent = '', restIndent = firstIndent) {
    const words = text.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) return [firstIndent.trimEnd()];

    const lines: string[] = [];
    let current = firstIndent;

    for (const word of words) {
        const indent = lines.length === 0 ? firstIndent : restIndent;
        const separator = current.trim().length === 0 ? '' : ' ';
        const candidate = `${current}${separator}${word}`;

        if (candidate.length <= width || current === indent) {
            current = candidate;
            continue;
        }

        lines.push(current);
        current = `${restIndent}${word}`;
    }

    lines.push(current);
    return lines;
}

function isOrderedListItem(line: string) {
    return /^\d+\.\s+/.test(line);
}

function formatParagraph(line: string, width: number) {
    return wrapText(line, width, CONTENT_INDENT, CONTENT_INDENT)
        .map(renderInlineMarkdown)
        .join('\n');
}

function formatListItem(line: string, width: number) {
    const bulletMatch = line.match(/^([-*])\s+(.*)$/);

    if (bulletMatch) {
        const bullet = bulletMatch[1] ?? '-';
        const content = bulletMatch[2] ?? '';
        return wrapText(content, width, `${CONTENT_INDENT}${bullet} `, `${CONTENT_INDENT}  `)
            .map(renderInlineMarkdown)
            .join('\n');
    }

    const orderedMatch = line.match(/^(\d+\.)\s+(.*)$/);

    if (orderedMatch) {
        const marker = orderedMatch[1] ?? '1.';
        const content = orderedMatch[2] ?? '';
        return wrapText(content, width, `${CONTENT_INDENT}${marker} `, `${CONTENT_INDENT}${' '.repeat(marker.length + 1)}`)
            .map(renderInlineMarkdown)
            .join('\n');
    }

    return formatParagraph(line, width);
}

function formatCodeLine(line: string) {
    return colorize(`${CODE_INDENT}${line}`, BLUE);
}

export function renderHeader(conversationId: string, model: string, toolCount = 0, gpu?: { type: 'nvidia'; name: string } | { type: 'none' }) {
    const gpuLine = gpu?.type === 'nvidia' ? colorize(`GPU: ${gpu.name}`, DIM) : null;
    const lines = [
        colorize('Local AI', `${BOLD}${CYAN}`),
        colorize(`${model}  ·  ${conversationId}`, DIM),
        ...(toolCount > 0 ? [colorize(`${toolCount} tools`, DIM)] : []),
        ...(gpuLine ? [gpuLine] : []),
        colorize('/help  /new  /clear  exit  ·  ESC to cancel', DIM),
        '',
    ];

    return lines.join('\n');
}

export function userPrompt() {
    return colorize(`${config.user.name} › `, `${BOLD}${GREEN}`);
}

export function assistantLabel() {
    return colorize('  ●  ', MAGENTA) + colorize('Assistant', `${BOLD}${MAGENTA}`);
}

export function thinkingLabel() {
    return colorize('  ·  ', DIM);
}

function isSpecialLine(buf: string): boolean {
    const t = buf.trimStart();
    return (
        t.startsWith('#') ||
        t.startsWith('- ') ||
        t.startsWith('* ') ||
        isOrderedListItem(t) ||
        t.startsWith('```')
    );
}

export function createStreamingRenderer() {
    let inCodeBlock = false;
    let lineBuffer = '';
    let atLineStart = true;
    const width = terminalWidth() - 2;

    const flushCompleteLine = (line: string) => {
        const trimmed = line.trimEnd();
        const t = trimmed.trim();

        if (t.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            process.stdout.write(colorize(CODE_SEPARATOR, DIM) + '\n');
            atLineStart = true;
            return;
        }
        if (inCodeBlock) {
            process.stdout.write(formatCodeLine(trimmed) + '\n');
            atLineStart = true;
            return;
        }
        if (t.length === 0) {
            process.stdout.write('\n');
            atLineStart = true;
            return;
        }
        if (t.startsWith('#')) {
            process.stdout.write(colorize(`${CONTENT_INDENT}${t.replace(/^#+\s*/, '')}`, `${BOLD}${CYAN}`) + '\n');
            atLineStart = true;
            return;
        }
        if (t.startsWith('- ') || t.startsWith('* ') || isOrderedListItem(t)) {
            process.stdout.write(formatListItem(t, width) + '\n');
            atLineStart = true;
            return;
        }
        // Regular prose that was already streamed — just terminate the line.
        process.stdout.write('\n');
        atLineStart = true;
    };

    return {
        write(chunk: string) {
            let rest = chunk;

            while (rest.length > 0) {
                const nlIdx = rest.indexOf('\n');

                if (nlIdx === -1) {
                    lineBuffer += rest;

                    // Stream prose chunks immediately; buffer special/code lines.
                    if (!inCodeBlock && !isSpecialLine(lineBuffer)) {
                        if (atLineStart && rest.trimStart().length > 0) {
                            process.stdout.write(CONTENT_INDENT);
                            atLineStart = false;
                        }
                        process.stdout.write(rest);
                    }
                    break;
                }

                const segment = rest.slice(0, nlIdx);
                rest = rest.slice(nlIdx + 1);
                lineBuffer += segment;

                const line = lineBuffer;
                lineBuffer = '';

                const isSpecial = inCodeBlock || isSpecialLine(line);

                if (isSpecial) {
                    flushCompleteLine(line);
                } else {
                    // Prose was streamed live — just end the line.
                    if (line.trim().length === 0) {
                        process.stdout.write('\n');
                    } else {
                        process.stdout.write('\n');
                    }
                    atLineStart = true;
                }
            }
        },
        flush() {
            if (lineBuffer) {
                flushCompleteLine(lineBuffer);
                lineBuffer = '';
            }
        },
    };
}

export function renderConfig(cfg: {
    user: { name: string };
    ollama: { baseURL: string; model: string };
    chat: { maxSteps: number; thinking: boolean; debug: boolean; systemPrompt?: string };
    configPath: string;
}) {
    const row = (label: string, value: string) =>
        `${CONTENT_INDENT}${colorize(label.padEnd(14), DIM)}${value}`;

    const lines = [
        '',
        colorize(`${CONTENT_INDENT}Configuration`, `${BOLD}${CYAN}`),
        colorize(`${CONTENT_INDENT}File: ${cfg.configPath}`, DIM),
        '',
        colorize(`${CONTENT_INDENT}User`, `${BOLD}`),
        row('name', cfg.user.name),
        '',
        colorize(`${CONTENT_INDENT}Ollama`, `${BOLD}`),
        row('host', cfg.ollama.baseURL),
        row('model', cfg.ollama.model),
        '',
        colorize(`${CONTENT_INDENT}Chat`, `${BOLD}`),
        row('maxSteps', String(cfg.chat.maxSteps)),
        row('thinking', cfg.chat.thinking ? 'on' : 'off'),
        row('debug', cfg.chat.debug ? 'on' : 'off'),
        ...(cfg.chat.systemPrompt
            ? [row('systemPrompt', cfg.chat.systemPrompt.slice(0, 60) + (cfg.chat.systemPrompt.length > 60 ? '…' : ''))]
            : []),
        '',
    ];

    return lines.join('\n');
}

export function createSpinner() {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let message = 'thinking…';
    let i = 0;
    let interval: ReturnType<typeof setInterval> | null = null;

    const render = () => {
        if (!interval) return; // guard: discard stale timer callbacks after stop()
        const frame = colorize(frames[i % frames.length]!, MAGENTA);
        const status = colorize(message, DIM);
        process.stdout.write(`\r\x1b[2K  ${frame}  ${status}`);
        i++;
    };

    return {
        start() {
            process.stdout.write('\n');
            interval = setInterval(render, 80);
        },
        update(msg: string) {
            message = msg;
            render(); // only renders if interval is active (guard in render())
        },
        resume() {
            if (!interval) interval = setInterval(render, 80);
            render();
        },
        stop() {
            if (interval) {
                clearInterval(interval);
                interval = null;
            }
            process.stdout.write('\r\x1b[2K');
        },
    };
}

export function renderElapsed(ms: number) {
    const s = (ms / 1000).toFixed(1);
    return colorize(`${CONTENT_INDENT}done in ${s}s`, DIM);
}

export function debugLine(message: string) {
    return colorize(`${CONTENT_INDENT}[debug] ${message}`, DIM);
}

export function permissionPrompt(toolName: string, description: string): string {
    const cmd = description.length > 72 ? description.slice(0, 72) + '…' : description;
    return `  ${colorize(toolName, `${BOLD}${YELLOW}`)}  ${colorize(cmd, DIM)}\n  ${colorize('Allow?', BOLD)} ${colorize('[y/N] ', DIM)}`;
}

export function permissionGranted(): string { return colorize('y\n', GREEN); }
export function permissionDenied(): string  { return colorize('n\n', RED);   }

export function infoMessage(message: string) {
    return colorize(message, YELLOW);
}

export function errorMessage(message: string) {
    return colorize(message, RED);
}

export function clearScreen() {
    process.stdout.write('\x1Bc');
}
