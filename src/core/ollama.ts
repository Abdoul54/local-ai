import { config } from './config';

type TagsResponse = { models: Array<{ name: string }> };
type PsResponse  = { models: Array<{ name: string }> };

export async function isModelLoaded(): Promise<boolean> {
    const baseURL = config.ollama.baseURL.replace(/\/+$/, '');
    const model = config.ollama.model;
    const baseName = model.replace(/:.*$/, '');
    try {
        const res = await fetch(`${baseURL}/ps`);
        if (!res.ok) return false;
        const data = await res.json() as PsResponse;
        return (data.models ?? []).some(m => m.name === model || m.name.startsWith(baseName + ':'));
    } catch {
        return false;
    }
}

export async function checkOllama(): Promise<void> {
    const baseURL = config.ollama.baseURL.replace(/\/+$/, '');
    let models: Array<{ name: string }>;

    try {
        const res = await fetch(`${baseURL}/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as TagsResponse;
        models = data.models ?? [];
    } catch {
        console.error([
            '',
            `  Cannot connect to Ollama at: ${baseURL}`,
            '',
            '  Make sure Ollama is running:',
            '    ollama serve',
            '',
            '  Or point to a different host:',
            '    OLLAMA_HOST=http://host:11434/api bun run start',
            '',
        ].join('\n'));
        process.exit(1);
    }

    const model = config.ollama.model;
    const baseName = model.replace(/:.*$/, '');
    const found = models.some(m => m.name === model || m.name.startsWith(baseName + ':'));

    if (!found) {
        const available = models.map(m => `    • ${m.name}`).join('\n') || '    (none)';
        console.error([
            '',
            `  Model "${model}" is not available locally.`,
            '',
            '  Pull it with:',
            `    ollama pull ${model}`,
            '',
            '  Or choose from available models:',
            available,
            '',
            '  Then set it:',
            `    OLLAMA_MODEL=<model> bun run start`,
            '',
        ].join('\n'));
        process.exit(1);
    }
}
