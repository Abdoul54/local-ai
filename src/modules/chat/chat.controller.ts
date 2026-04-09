import readline from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { stdin as input, stdout as output } from 'node:process';
import { ChatService } from './chat.service';
import { config } from '../../core/config';
import { CONFIG_PATH } from '../../core/user-config';
import {
    clearScreen,
    errorMessage,
    infoMessage,
    permissionDenied,
    permissionGranted,
    permissionPrompt,
    renderConfig,
    renderHeader,
    userPrompt,
} from './cli-ui';
import type { ConfirmFn } from '../ai/ai.service';

export class ChatController {
    private rl!: readline.Interface;

    constructor(private service: ChatService, private readonly toolCount: number = 0) {}

    private createRl() {
        return readline.createInterface({ input, output });
    }

    /**
     * Close readline (so it stops listening to stdin), take over stdin in raw
     * mode, listen for ESC. Returns a cleanup function that restores readline.
     */
    private createConfirmFn(): ConfirmFn {
        return (toolName, description) => new Promise((resolve) => {
            process.stdout.write(permissionPrompt(toolName, description));
            process.stdin.once('data', (chunk: Buffer) => {
                const yes = chunk.length > 0 && (chunk[0] === 0x79 || chunk[0] === 0x59); // y/Y
                process.stdout.write(yes ? permissionGranted() : permissionDenied());
                resolve(yes);
            });
        });
    }

    private listenForEsc(abort: AbortController): () => void {
        // Close readline so it no longer has a 'data' listener on stdin.
        // It's safe here — question() has already returned its answer.
        this.rl.close();

        process.stdin.setRawMode(true);
        process.stdin.resume();

        const onData = (chunk: Buffer) => {
            // ESC is a single 0x1b byte. Arrow keys also start with 0x1b but
            // arrive with more bytes in the same chunk, so check length.
            if (chunk.length === 1 && chunk[0] === 0x1b) {
                abort.abort();
            }
            // Consume everything else silently (Enter, arrows, etc.).
        };

        process.stdin.on('data', onData);

        return () => {
            process.stdin.off('data', onData);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            // Restore readline for the next prompt.
            this.rl = this.createRl();
        };
    }

    async start() {
        this.rl = this.createRl();

        process.on('SIGINT', () => {
            process.stdout.write('\r\x1b[2K\n');
            this.rl.close();
            process.exit(0);
        });

        let sessionId = randomUUID();

        clearScreen();
        console.log(renderHeader(sessionId, config.ollama.model, this.toolCount));

        while (true) {
            const userInput = (await this.rl.question(userPrompt())).trim();

            if (userInput === 'exit') break;
            if (userInput.length === 0) continue;

            if (userInput === '/help') {
                console.log(infoMessage('Available commands: /help, /new, /clear, /config, exit\n'));
                continue;
            }

            if (userInput === '/config') {
                console.log(renderConfig({ ...config, configPath: CONFIG_PATH }));
                continue;
            }

            if (userInput === '/clear') {
                clearScreen();
                console.log(renderHeader(sessionId, config.ollama.model, this.toolCount));
                continue;
            }

            if (userInput === '/new') {
                this.service.reset();
                sessionId = randomUUID();
                clearScreen();
                console.log(renderHeader(sessionId, config.ollama.model, this.toolCount));
                console.log(infoMessage('Started a fresh conversation.\n'));
                continue;
            }

            const abort = new AbortController();
            const stopListening = this.listenForEsc(abort);

            try {
                await this.service.sendMessage(userInput, abort.signal, this.createConfirmFn());
                console.log();
            } catch (error) {
                if ((error as Error).name === 'AbortError') {
                    process.stdout.write('\r\x1b[2K');
                    console.log(infoMessage('\n  cancelled\n'));
                } else {
                    const message = error instanceof Error ? error.message : String(error);
                    console.log(`\n${errorMessage(`Request failed: ${message}`)}\n`);
                }
            } finally {
                stopListening();
            }
        }

        this.rl.close();
    }
}
