import { createOllama } from 'ollama-ai-provider-v2';
import { stepCountIs, streamText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { tools as appTools } from './tools.registry';
import { assistantLabel, createSpinner, createStreamingRenderer } from '../chat/cli-ui';
import { config } from '../../core/config';

const ollama = createOllama({
    baseURL: config.ollama.baseURL,
});

export class AIService {
    async generate(messages: ModelMessage[]) {
        const result = streamText({
            model: ollama(config.ollama.model),
            messages: [
                {
                    role: 'system',
                    content: config.chat.systemPrompt ??
                        `You are ${config.user.name}'s personal AI assistant with access to the local file system and shell. ` +
                        'Use tools when needed. ' +
                        'When the user asks about files or directories without an absolute path, ' +
                        'assume they mean the current working directory unless they say otherwise. ' +
                        'If the user says "this directory" or "current directory", do not ask a follow-up question. ' +
                        'Use the directory tool on "." and answer directly. ' +
                        'For directory listings, be concise and list names only. ' +
                        'Do not include "." or ".." unless the user explicitly asks for them.',
                },
                ...messages,
            ],
            stopWhen: stepCountIs(config.chat.maxSteps),
            tools: {
                directory: tool({
                    description: 'List files and folders in a directory',
                    inputSchema: z.object({
                        path: z.string().default('.'),
                    }),
                    execute: async ({ path }) => {
                        return appTools.directory.list(path);
                    },
                }),
                shell: tool({
                    description: 'Execute shell commands',
                    inputSchema: z.object({
                        command: z.string(),
                    }),
                    execute: async ({ command }) => {
                        return appTools.shell.execute(command);
                    },
                }),
                file: tool({
                    description: 'Read files from disk',
                    inputSchema: z.object({
                        path: z.string(),
                    }),
                    execute: async ({ path }) => {
                        return appTools.file.read(path);
                    },
                }),
            },
        });

        let full = '';
        const renderer = createStreamingRenderer();
        const spinner = createSpinner();
        let started = false;

        spinner.start();

        for await (const chunk of result.textStream) {
            if (!started) {
                spinner.stop();
                process.stdout.write(assistantLabel() + '\n');
                started = true;
            }
            full += chunk;
            renderer.write(chunk);
        }

        if (!started) spinner.stop();
        renderer.flush();
        process.stdout.write('\n');

        return full;
    }
}
