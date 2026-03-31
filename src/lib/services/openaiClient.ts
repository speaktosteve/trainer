import { AzureOpenAI } from "openai";
import { env } from "$env/dynamic/private";

let client: AzureOpenAI | null = null;

export function getOpenAIClient(): AzureOpenAI {
  if (!client) {
    client = new AzureOpenAI({
      endpoint: env.AZURE_OPENAI_ENDPOINT,
      apiKey: env.AZURE_OPENAI_KEY,
      apiVersion: "2024-10-21",
    });
  }
  return client;
}

export function getDeploymentName(): string {
  return env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini";
}

export function isLLMConfigured(): boolean {
  return Boolean(env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_KEY);
}
