#!/usr/bin/env bun
import { checkOllama } from './core/ollama';
import { ChatController } from './modules/chat/chat.controller';
import { ChatRepository } from './modules/chat/chat.repository';
import { ChatService } from './modules/chat/chat.service';
import { AIService } from './modules/ai/ai.service';
process.on('SIGINT', () => {
    process.stdout.write('\r\x1b[2K\n');
    process.exit(0);
});

await checkOllama();

const repo = new ChatRepository();
const ai = new AIService();
const service = new ChatService(repo, ai);
const controller = new ChatController(service);

await controller.start();
