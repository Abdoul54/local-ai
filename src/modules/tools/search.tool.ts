import { HOME, assertInsideHome } from './tool-security';

const PRUNE = ['node_modules', '.git', '.cache', '.npm', 'proc', 'sys', 'dist', '.next'];

export class SearchTool {
    private readonly hasFd:  boolean;
    private readonly fdBin:  string;
    private readonly hasRg:  boolean;

    constructor(tools: string[] = []) {
        this.hasFd = tools.includes('fd') || tools.includes('fdfind');
        this.fdBin = tools.includes('fd') ? 'fd' : 'fdfind';
        this.hasRg = tools.includes('rg');
    }

    // Find files or directories by name/glob pattern.
    async byName(pattern: string, rootPath = HOME, type: 'file' | 'dir' | 'any' = 'any', maxResults = 50): Promise<string> {
        try {
            assertInsideHome(rootPath);
            let out: string;

            if (this.hasFd) {
                const typeFlag = type === 'file' ? ['-t', 'f'] : type === 'dir' ? ['-t', 'd'] : [];
                const excludes = PRUNE.flatMap(p => ['-E', p]);
                const proc = Bun.spawn(
                    [this.fdBin, '--color=never', '--hidden', ...typeFlag, ...excludes, pattern, rootPath],
                    { stdout: 'pipe', stderr: 'pipe', stdin: null, cwd: HOME },
                );
                out = await new Response(proc.stdout).text();
            } else {
                const typeFlag = type === 'file' ? ['-type', 'f'] : type === 'dir' ? ['-type', 'd'] : [];
                const pruneArgs = PRUNE.flatMap(p => ['-name', p, '-prune', '-o']);
                const proc = Bun.spawn(
                    ['find', rootPath, ...pruneArgs, ...typeFlag, '-iname', `*${pattern}*`, '-print'],
                    { stdout: 'pipe', stderr: 'pipe', stdin: null, cwd: HOME },
                );
                out = await new Response(proc.stdout).text();
            }

            const lines = out.trim().split('\n').filter(Boolean).slice(0, maxResults);
            if (!lines.length) return 'No results found.';
            return lines.join('\n') + (lines.length === maxResults ? `\n… (showing first ${maxResults})` : '');
        } catch (error) {
            return `Search Error: ${error}`;
        }
    }

    // Search file contents — returns matches with file, line number, and snippet.
    async byContent(pattern: string, rootPath = HOME, maxResults = 30): Promise<string> {
        try {
            assertInsideHome(rootPath);
            let out: string;

            if (this.hasRg) {
                const excludes = PRUNE.flatMap(p => [`--glob=!${p}`]);
                const proc = Bun.spawn(
                    ['rg', '--color=never', '--line-number', '--with-filename',
                     '--max-count=3', '--trim', ...excludes, pattern, rootPath],
                    { stdout: 'pipe', stderr: 'pipe', stdin: null, cwd: HOME },
                );
                out = await new Response(proc.stdout).text();
            } else {
                const excludes = PRUNE.flatMap(p => [`--exclude-dir=${p}`]);
                const proc = Bun.spawn(
                    ['grep', '-rn', '--color=never', ...excludes, pattern, rootPath],
                    { stdout: 'pipe', stderr: 'pipe', stdin: null, cwd: HOME },
                );
                out = await new Response(proc.stdout).text();
            }

            const lines = out.trim().split('\n').filter(Boolean).slice(0, maxResults);
            if (!lines.length) return 'No matches found.';
            return lines.join('\n') + (lines.length === maxResults ? `\n… (showing first ${maxResults})` : '');
        } catch (error) {
            return `Search Error: ${error}`;
        }
    }
}
