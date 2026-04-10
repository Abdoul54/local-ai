import { readFileSync } from 'node:fs';

export const isWindows = process.platform === 'win32';

export const isWSL = !isWindows && (() => {
    try {
        return readFileSync('/proc/version', 'utf-8').toLowerCase().includes('microsoft');
    } catch {
        return false;
    }
})();
