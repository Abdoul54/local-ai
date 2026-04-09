import { userConfig } from './user-config';

export const config = {
    user: {
        name: userConfig.user.name,
    },
    ollama: {
        baseURL: process.env.OLLAMA_HOST ?? userConfig.ollama.host,
        model: process.env.OLLAMA_MODEL ?? userConfig.ollama.model,
    },
    db: {
        path: process.env.DB_PATH ?? userConfig.chat.dbPath,
    },
    chat: {
        maxSteps: userConfig.chat.maxSteps,
        systemPrompt: userConfig.chat.systemPrompt,
    },
} as const;
