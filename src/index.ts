#!/usr/bin/env bun
import { checkOllama } from './core/ollama';
import { detectCapabilities } from './core/capabilities';
import { detectGPU } from './core/gpu';
import { ChatController } from './modules/chat/chat.controller';
import { ChatService } from './modules/chat/chat.service';
import { AIService } from './modules/ai/ai.service';

await checkOllama();
const [caps, gpu] = await Promise.all([detectCapabilities(), detectGPU()]);

const ai = new AIService(caps);
// Fire warmup in background — model loads while user reads the header.
ai.warmup();

const service = new ChatService(ai);
const controller = new ChatController(service, caps.length, gpu);

await controller.start();
