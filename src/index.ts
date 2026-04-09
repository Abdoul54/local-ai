#!/usr/bin/env bun
import { checkOllama } from './core/ollama';
import { detectCapabilities } from './core/capabilities';
import { ChatController } from './modules/chat/chat.controller';
import { ChatService } from './modules/chat/chat.service';
import { AIService } from './modules/ai/ai.service';

await checkOllama();
const caps = await detectCapabilities();

const ai = new AIService(caps);
const service = new ChatService(ai);
const controller = new ChatController(service, caps.length);

await controller.start();
