import { readFile, writeFile } from 'fs/promises';
import { assertInsideHome } from './tool-security';

export class FileTool {
    async read(path: string) {
        try {
            assertInsideHome(path);
            return await readFile(path, 'utf-8');
        } catch (error) {
            return `File Error: ${error}`;
        }
    }

    async write(path: string, content: string) {
        try {
            assertInsideHome(path);
            await writeFile(path, content, 'utf-8');
            return `Written: ${path}`;
        } catch (error) {
            return `File Error: ${error}`;
        }
    }
}