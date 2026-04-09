import { Planner } from './planner';
import { Executor } from './executor';
import { AIService } from '../ai/ai.service';

export class Workflow {
    constructor(
        private planner: Planner,
        private executor: Executor,
        private ai: AIService,
    ) { }

    async run(goal: string) {
        const plan = this.planner.createPlan(goal);

        return this.executor.executePlan(plan, async (step) => {
            return this.ai.generate([
                {
                    role: 'user',
                    content: step,
                },
            ]);
        });
    }
}