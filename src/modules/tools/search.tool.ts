import { HOME, assertInsideHome } from './tool-security';
import { isWindows } from '../../core/platform';

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

    private async spawn(argv: string[]): Promise<string> {
        const proc = Bun.spawn(argv, { stdout: 'pipe', stderr: 'pipe', stdin: null, cwd: HOME });
        return new Response(proc.stdout).text();
    }

    private async spawnPS(command: string): Promise<string> {
        return this.spawn(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command]);
    }

    // Find files or directories by name/glob pattern.
    async byName(pattern: string, rootPath = HOME, type: 'file' | 'dir' | 'any' = 'any', maxResults = 50): Promise<string> {
        try {
            assertInsideHome(rootPath);
            let out: string;

            if (isWindows) {
                const itemType = type === 'file' ? 'Leaf' : type === 'dir' ? 'Container' : 'Any';
                const excludeFilter = PRUNE.map(p => `$_.Name -ne '${p}'`).join(' -and ');
                out = await this.spawnPS(
                    `Get-ChildItem -Path '${rootPath}' -Recurse -ErrorAction SilentlyContinue ` +
                    `| Where-Object { $_.PSIsContainer -eq $${itemType === 'Container' ? 'true' : itemType === 'Leaf' ? 'false' : '_'} ` +
                    (itemType === 'Any' ? '' : `} | Where-Object { $_ `) +
                    `${excludeFilter ? `| Where-Object { ${excludeFilter} }` : ''} ` +
                    `| Where-Object { $_.Name -like '*${pattern}*' } ` +
                    `| Select-Object -ExpandProperty FullName -First ${maxResults}`
                );
            } else if (this.hasFd) {
                const typeFlag = type === 'file' ? ['-t', 'f'] : type === 'dir' ? ['-t', 'd'] : [];
                const excludes = PRUNE.flatMap(p => ['-E', p]);
                out = await this.spawn([this.fdBin, '--color=never', '--hidden', ...typeFlag, ...excludes, pattern, rootPath]);
            } else {
                const typeFlag = type === 'file' ? ['-type', 'f'] : type === 'dir' ? ['-type', 'd'] : [];
                const pruneArgs = PRUNE.flatMap(p => ['-name', p, '-prune', '-o']);
                out = await this.spawn(['find', rootPath, ...pruneArgs, ...typeFlag, '-iname', `*${pattern}*`, '-print']);
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

            if (isWindows) {
                out = await this.spawnPS(
                    `Select-String -Path '${rootPath}\\*' -Recurse -Pattern '${pattern}' -ErrorAction SilentlyContinue ` +
                    `| Select-Object -First ${maxResults} ` +
                    `| ForEach-Object { $_.Filename + ':' + $_.LineNumber + ':' + $_.Line.Trim() }`
                );
            } else if (this.hasRg) {
                const excludes = PRUNE.flatMap(p => [`--glob=!${p}`]);
                out = await this.spawn(['rg', '--color=never', '--line-number', '--with-filename',
                    '--max-count=3', '--trim', ...excludes, pattern, rootPath]);
            } else {
                const excludes = PRUNE.flatMap(p => [`--exclude-dir=${p}`]);
                out = await this.spawn(['grep', '-rn', '--color=never', ...excludes, pattern, rootPath]);
            }

            const lines = out.trim().split('\n').filter(Boolean).slice(0, maxResults);
            if (!lines.length) return 'No matches found.';
            return lines.join('\n') + (lines.length === maxResults ? `\n… (showing first ${maxResults})` : '');
        } catch (error) {
            return `Search Error: ${error}`;
        }
    }
}
