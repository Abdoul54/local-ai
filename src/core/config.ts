import { userConfig } from './user-config';

export const config = {
    user: {
        name: userConfig.user.name,
    },
    ollama: {
        baseURL: process.env.OLLAMA_HOST ?? userConfig.ollama.host,
        model: process.env.OLLAMA_MODEL ?? userConfig.ollama.model,
    },
    chat: {
        maxSteps: userConfig.chat.maxSteps,
        thinking: userConfig.chat.thinking ?? false,
        debug: userConfig.chat.debug ?? false,
        systemPrompt: userConfig.chat.systemPrompt,
    },
} as const;
