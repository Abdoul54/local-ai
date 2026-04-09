export class Executor {
    async executePlan(steps: string[], handler: (step: string) => Promise<string>) {
        const results: string[] = [];

        for (const step of steps) {
            const result = await handler(step);
            results.push(`
                STEP: ${step} 
                RESULT: ${result}
            `);
        }

        return results;
    }
}