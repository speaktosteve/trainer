import type { PlanGenerationProvider } from "./planGeneration/provider";
import { LLMPlanProvider } from "./planGeneration/llmPlanProvider";
import { SmartCopyProvider } from "./planGeneration/smartCopyProvider";
import { isLLMConfigured } from "./openaiClient";

export type { PlanGenerationProvider } from "./planGeneration/provider";
export { LLMPlanProvider } from "./planGeneration/llmPlanProvider";
export { SmartCopyProvider } from "./planGeneration/smartCopyProvider";

/** Default singleton */
export const planGenerator: PlanGenerationProvider = new SmartCopyProvider();

/** LLM-backed singleton */
export const llmPlanGenerator: PlanGenerationProvider = new LLMPlanProvider();

export function getPlanGenerator(): PlanGenerationProvider {
  return isLLMConfigured() ? llmPlanGenerator : planGenerator;
}
