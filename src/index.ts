#!/usr/bin/env bun
import { checkOllama, isModelLoaded } from './core/ollama';
import { detectCapabilities } from './core/capabilities';
import { detectGPU } from './core/gpu';
import { ChatController } from './modules/chat/chat.controller';
import { ChatService } from './modules/chat/chat.service';
import { AIService } from './modules/ai/ai.service';
import { waitWithSpinner } from './modules/chat/cli-ui';
import { config } from './core/config';

await checkOllama();
const [caps, gpu, modelReady] = await Promise.all([detectCapabilities(), detectGPU(), isModelLoaded()]);

const ai = new AIService(caps);
// Skip warmup if the model is already loaded in Ollama (e.g. previous session).
if (!modelReady) {
    await waitWithSpinner(`loading ${config.ollama.model}…`, ai.warmup());
}

const service = new ChatService(ai);
const controller = new ChatController(service, caps.length, gpu);

await controller.start();
