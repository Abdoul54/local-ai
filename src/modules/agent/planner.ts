export class Planner {
    createPlan(goal: string): string[] {
        return [
            `Analyze objective: ${goal}`,
            'Determine required tools',
            'Execute tasks step by step',
            'Validate output',
            'Summarize results',
        ];
    }
}