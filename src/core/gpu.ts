import { isWindows } from './platform';

export type GPUInfo = { type: 'nvidia' | 'amd'; name: string } | { type: 'none' };

export async function detectGPU(): Promise<GPUInfo> {
    const gpu = isWindows ? await detectWindows() : await detectLinux();
    if (gpu.type !== 'none') {
        // Tell Ollama to put all layers on GPU — prevents partial CPU fallback.
        process.env.OLLAMA_NUM_GPU = '999';
    }
    return gpu;
}

async function detectLinux(): Promise<GPUInfo> {
    // NVIDIA — works on Linux and WSL2.
    try {
        const proc = Bun.spawn(
            ['nvidia-smi', '--query-gpu=name', '--format=csv,noheader'],
            { stdout: 'pipe', stderr: 'pipe', stdin: null },
        );
        const [text] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
        if (proc.exitCode === 0) {
            const name = text.trim().split('\n')[0]?.trim() ?? 'NVIDIA GPU';
            return { type: 'nvidia', name };
        }
    } catch {}

    // AMD via ROCm — native Linux only (not WSL2).
    try {
        const proc = Bun.spawn(
            ['rocm-smi', '--showproductname', '--csv'],
            { stdout: 'pipe', stderr: 'pipe', stdin: null },
        );
        const [text] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
        if (proc.exitCode === 0) {
            const name = text.trim().split('\n')[1]?.split(',')[1]?.trim() ?? 'AMD GPU';
            return { type: 'amd', name };
        }
    } catch {}

    return { type: 'none' };
}

async function detectWindows(): Promise<GPUInfo> {
    // Query WMI for all video controllers — works for both NVIDIA and AMD.
    try {
        const proc = Bun.spawn(
            ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
             "Get-WmiObject Win32_VideoController | Where-Object { $_.AdapterRAM -gt 0 } | Select-Object -ExpandProperty Name"],
            { stdout: 'pipe', stderr: 'pipe', stdin: null },
        );
        const [text] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
        if (proc.exitCode === 0) {
            const name = text.trim().split('\n')[0]?.trim();
            if (name) {
                const type = /amd|radeon/i.test(name) ? 'amd' : 'nvidia';
                return { type, name };
            }
        }
    } catch {}

    return { type: 'none' };
}
