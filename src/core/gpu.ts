export type GPUInfo = { type: 'nvidia'; name: string } | { type: 'none' };

export async function detectGPU(): Promise<GPUInfo> {
    try {
        const proc = Bun.spawn(
            ['nvidia-smi', '--query-gpu=name', '--format=csv,noheader'],
            { stdout: 'pipe', stderr: 'pipe', stdin: null },
        );
        const [text] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
        if (proc.exitCode === 0) {
            const name = text.trim().split('\n')[0]?.trim() ?? 'NVIDIA GPU';
            // Force all model layers onto GPU so Ollama doesn't fall back to CPU.
            process.env.OLLAMA_NUM_GPU = '999';
            return { type: 'nvidia', name };
        }
    } catch {}
    return { type: 'none' };
}
