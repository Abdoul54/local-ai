import { $ } from 'bun';

export class SearchTool {
    private readonly hasFd: boolean;
    private readonly fdBin: string;
    private readonly hasRg: boolean;

    constructor(tools: string[] = []) {
        this.hasFd = tools.includes('fd') || tools.includes('fdfind');
        this.fdBin = tools.includes('fd') ? 'fd' : 'fdfind';
        this.hasRg = tools.includes('rg');
    }

    async byName(rootPath: string, pattern: string, maxResults = 30): Promise<string> {
        try {
            let out: string;

            if (this.hasFd) {
                out = await $`${this.fdBin} ${pattern} ${rootPath}
                    --type f
                    --exclude node_modules
                    --exclude .git
                    --exclude proc
                    --exclude sys`.nothrow().quiet().text();
            } else {
                out = await $`find ${rootPath} -name ${pattern}
                    -not -path "*/node_modules/*"
                    -not -path "*/.git/*"
                    -not -path "*/proc/*"
                    -not -path "*/sys/*"`.nothrow().quiet().text();
            }

            const lines = out.trim().split('\n').filter(Boolean).slice(0, maxResults);
            if (!lines.length) return 'No files found.';
            return lines.join('\n') + (lines.length === maxResults ? `\n(showing first ${maxResults} results)` : '');
        } catch (error) {
            return `Search Error: ${error}`;
        }
    }

    async byContent(rootPath: string, pattern: string, maxResults = 30): Promise<string> {
        try {
            let out: string;

            if (this.hasRg) {
                out = await $`rg -rl ${pattern} ${rootPath}
                    --glob !node_modules
                    --glob !.git
                    --glob !proc
                    --glob !sys`.nothrow().quiet().text();
            } else {
                out = await $`grep -rl ${pattern} ${rootPath}
                    --exclude-dir=node_modules
                    --exclude-dir=.git
                    --exclude-dir=proc
                    --exclude-dir=sys`.nothrow().quiet().text();
            }

            const lines = out.trim().split('\n').filter(Boolean).slice(0, maxResults);
            if (!lines.length) return 'No matches found.';
            return lines.join('\n') + (lines.length === maxResults ? `\n(showing first ${maxResults} results)` : '');
        } catch (error) {
            return `Search Error: ${error}`;
        }
    }
}
