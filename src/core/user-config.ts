import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const CONFIG_DIR = join(homedir(), '.config', 'local-ai');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export type UserConfig = {
    user: {
        name: string;
    };
    ollama: {
        host: string;
        model: string;
    };
    chat: {
        maxSteps: number;
        dbPath: string;
        systemPrompt?: string;
    };
};

const defaults: UserConfig = {
    user: {
        name: 'User',
    },
    ollama: {
        host: 'http://localhost:11434/api',
        model: 'gemma4:latest',
    },
    chat: {
        maxSteps: 5,
        dbPath: join(homedir(), '.local', 'share', 'local-ai', 'chat.db'),
    },
};

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
    const result = { ...base };
    for (const key of Object.keys(override) as (keyof T)[]) {
        const val = override[key];
        if (val === undefined) continue;
        const baseVal = base[key];
        if (typeof val === 'object' && val !== null && typeof baseVal === 'object' && baseVal !== null) {
            (result as Record<string, unknown>)[key as string] = deepMerge(baseVal as Record<string, unknown>, val as Record<string, unknown>);
        } else {
            result[key] = val;
        }
    }
    return result;
}

function load(): UserConfig {
    if (!existsSync(CONFIG_PATH)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
        writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2) + '\n', 'utf-8');
        return defaults;
    }

    try {
        const raw = readFileSync(CONFIG_PATH, 'utf-8');
        return deepMerge(defaults, JSON.parse(raw) as Partial<UserConfig>);
    } catch {
        console.warn(`Warning: Could not parse ${CONFIG_PATH} — using defaults.\n`);
        return defaults;
    }
}

export const userConfig = load();
