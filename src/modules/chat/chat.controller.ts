import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ChatService } from './chat.service';
import { migrate } from '../../core/database/client';
import { config } from '../../core/config';
import { CONFIG_PATH } from '../../core/user-config';
import {
    clearScreen,
    errorMessage,
    infoMessage,
    renderConfig,
    renderHeader,
    userPrompt,
} from './cli-ui';

export class ChatController {
    constructor(private service: ChatService) { }

    async start() {
        migrate();

        const rl = readline.createInterface({ input, output });

        let conversationId = this.service.createConversation();

        clearScreen();
        console.log(renderHeader(conversationId, config.ollama.model));

        while (true) {
            const userInput = (await rl.question(userPrompt())).trim();

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
                console.log(renderHeader(conversationId, config.ollama.model));
                continue;
            }

            if (userInput === '/new') {
                conversationId = this.service.createConversation();
                clearScreen();
                console.log(renderHeader(conversationId, config.ollama.model));
                console.log(infoMessage('Started a fresh conversation.\n'));
                continue;
            }

            try {
                await this.service.sendMessage(conversationId, userInput);
                console.log();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.log(`\n${errorMessage(`Request failed: ${message}`)}\n`);
            }
        }

        rl.close();
    }
}
