import { createOllama } from 'ollama-ai-provider-v2';
import { streamText } from 'ai';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { randomUUID } from 'crypto';
import { db } from './db';

const ollama = createOllama({
    baseURL: 'http://localhost:11434/api',
});

const rl = readline.createInterface({ input, output });

const conversationId = randomUUID();

db.query(`
  INSERT INTO conversations (id)
  VALUES (?)
`).run(conversationId);

console.log(`Started conversation: ${conversationId}`);
console.log('Type "exit" to quit.\n');

while (true) {
    const userInput = await rl.question('You: ');

    if (userInput === 'exit') break;

    db.query(`
    INSERT INTO messages (conversation_id, role, content)
    VALUES (?, ?, ?)
  `).run(conversationId, 'user', userInput);

    const messages = db.query(`
    SELECT role, content
    FROM messages
    WHERE conversation_id = ?
    ORDER BY id ASC
  `).all(conversationId) as { role: 'user' | 'assistant'; content: string }[];

    const result = streamText({
        model: ollama('gemma4:latest'),
        messages,
    });

    let fullResponse = '';

    process.stdout.write('\nAI: ');

    for await (const chunk of result.textStream) {
        process.stdout.write(chunk);
        fullResponse += chunk;
    }

    process.stdout.write('\n');

    db.query(`
    INSERT INTO messages (conversation_id, role, content)
    VALUES (?, ?, ?)
  `).run(conversationId, 'assistant', fullResponse);
}

rl.close();