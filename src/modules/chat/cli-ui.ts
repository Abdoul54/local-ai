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

export function renderHeader(conversationId: string, model: string) {
    const lines = [
        colorize('Local AI', `${BOLD}${CYAN}`),
        colorize(`Model: ${model}  •  Conversation: ${conversationId}`, DIM),
        colorize('Commands: /help  /new  /clear  exit', DIM),
        '',
    ];

    return lines.join('\n');
}

export function userPrompt() {
    return colorize('You › ', `${BOLD}${GREEN}`);
}

export function assistantLabel() {
    return colorize('AI  › ', `${BOLD}${MAGENTA}`);
}

export function createStreamingRenderer() {
    let inCodeBlock = false;
    let lineBuffer = '';
    const width = terminalWidth() - 2;

    const processLine = (line: string) => {
        const trimmed = line.trimEnd();

        if (trimmed.trimStart().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            process.stdout.write(colorize(CODE_SEPARATOR, DIM) + '\n');
            return;
        }

        if (inCodeBlock) {
            process.stdout.write(formatCodeLine(trimmed) + '\n');
            return;
        }

        const t = trimmed.trim();

        if (t.length === 0) {
            process.stdout.write('\n');
            return;
        }

        if (t.startsWith('#')) {
            process.stdout.write(colorize(`${CONTENT_INDENT}${t.replace(/^#+\s*/, '')}`, `${BOLD}${CYAN}`) + '\n');
            return;
        }

        if (t.startsWith('- ') || t.startsWith('* ') || isOrderedListItem(t)) {
            process.stdout.write(formatListItem(t, width) + '\n');
            return;
        }

        process.stdout.write(formatParagraph(t, width) + '\n');
    };

    return {
        write(chunk: string) {
            lineBuffer += chunk;
            let newlineIndex: number;
            while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
                processLine(lineBuffer.slice(0, newlineIndex));
                lineBuffer = lineBuffer.slice(newlineIndex + 1);
            }
        },
        flush() {
            if (lineBuffer.trim()) {
                processLine(lineBuffer);
                lineBuffer = '';
            }
        },
    };
}

export function renderConfig(cfg: {
    user: { name: string };
    ollama: { baseURL: string; model: string };
    db: { path: string };
    chat: { maxSteps: number; systemPrompt?: string };
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
        row('dbPath', cfg.db.path),
        ...(cfg.chat.systemPrompt
            ? [row('systemPrompt', cfg.chat.systemPrompt.slice(0, 60) + (cfg.chat.systemPrompt.length > 60 ? '…' : ''))]
            : []),
        '',
    ];

    return lines.join('\n');
}

export function createSpinner() {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const label = colorize('AI  › ', `${BOLD}${MAGENTA}`) + colorize('thinking…', DIM);
    let i = 0;
    let interval: ReturnType<typeof setInterval> | null = null;

    return {
        start() {
            process.stdout.write('\n');
            interval = setInterval(() => {
                const frame = colorize(frames[i % frames.length]!, DIM);
                process.stdout.write(`\r${frame} ${label}`);
                i++;
            }, 80);
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

export function infoMessage(message: string) {
    return colorize(message, YELLOW);
}

export function errorMessage(message: string) {
    return colorize(message, RED);
}

export function clearScreen() {
    process.stdout.write('\x1Bc');
}
