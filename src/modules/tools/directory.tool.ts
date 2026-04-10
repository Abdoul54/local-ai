import { readdir } from 'fs/promises';
import { assertInsideHome } from './tool-security';

export class DirectoryTool {
    async list(path = '.') {
        try {
            assertInsideHome(path);
            const entries = await readdir(path, { withFileTypes: true });

            return entries
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((entry) => `${entry.isDirectory() ? 'dir' : 'file'}:${entry.name}`)
                .join('\n');
        } catch (error) {
            return `Directory Error: ${error}`;
        }
    }
}
