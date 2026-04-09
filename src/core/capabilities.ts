import { readdir } from 'fs/promises';
import { access, constants } from 'fs/promises';

/** Scan every directory in $PATH and return all executable names found. */
export async function detectCapabilities(): Promise<string[]> {
    const pathDirs = (process.env.PATH ?? '')
        .split(':')
        .filter(Boolean)
        // Skip Windows drives mounted under /mnt — they contain thousands of
        // .exe/.dll files that aren't useful Linux shell tools.
        .filter(dir => !dir.startsWith('/mnt/'));
    const seen = new Set<string>();

    await Promise.all(
        pathDirs.map(async (dir) => {
            try {
                const entries = await readdir(dir, { withFileTypes: true });
                await Promise.all(
                    entries.map(async (entry) => {
                        if (entry.isDirectory()) return;
                        try {
                            await access(`${dir}/${entry.name}`, constants.X_OK);
                            seen.add(entry.name);
                        } catch {
                            // not executable, skip
                        }
                    })
                );
            } catch {
                // dir doesn't exist or not readable, skip
            }
        })
    );

    return [...seen].sort();
}
