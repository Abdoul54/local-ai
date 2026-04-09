import { AIService, type ConfirmFn } from '../ai/ai.service';
import type { ModelMessage } from 'ai';

export class ChatService {
    private messages: ModelMessage[] = [];

    constructor(private ai: AIService) {}

    reset() {
        this.messages = [];
    }

    async sendMessage(input: string, signal?: AbortSignal, confirm?: ConfirmFn) {
        this.messages.push({ role: 'user', content: input });

        const response = await this.ai.generate(this.messages, signal, confirm);

        if (signal?.aborted) {
            this.messages.pop();
        } else {
            this.messages.push({ role: 'assistant', content: response });
        }
    }
}
