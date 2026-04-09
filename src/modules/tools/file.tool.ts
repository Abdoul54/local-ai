import { readFile } from 'fs/promises';

export class FileTool {
    async read(path: string) {
        try {
            return await readFile(path, 'utf-8');
        } catch (error) {
            return `File Error: ${error}`;
        }
    }
}