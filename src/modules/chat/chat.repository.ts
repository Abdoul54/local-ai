import { db } from '../../core/database/client';
import { randomUUID } from 'crypto';

export class ChatRepository {
    createConversation() {
        const id = randomUUID();

        db.query(`INSERT INTO conversations (id) VALUES (?)`).run(id);

        return id;
    }

    saveMessage(conversationId: string, role: string, content: string) {
        db.query(`
      INSERT INTO messages (conversation_id, role, content)
      VALUES (?, ?, ?)
    `).run(conversationId, role, content);
    }

    getMessages(conversationId: string) {
        return db.query(`
      SELECT role, content
      FROM messages
      WHERE conversation_id = ?
      ORDER BY id ASC
    `).all(conversationId) as { role: 'user' | 'assistant' | 'system'; content: string }[];
    }
}