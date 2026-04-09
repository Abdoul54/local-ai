import { ChatRepository } from './chat.repository';
import { AIService } from '../ai/ai.service';

export class ChatService {
    constructor(
        private repo: ChatRepository,
        private ai: AIService,
    ) { }

    createConversation() {
        return this.repo.createConversation();
    }

    async sendMessage(conversationId: string, input: string) {
        this.repo.saveMessage(conversationId, 'user', input);

        const messages = this.repo.getMessages(conversationId);

        const response = await this.ai.generate(messages);

        this.repo.saveMessage(conversationId, 'assistant', response);
    }
}