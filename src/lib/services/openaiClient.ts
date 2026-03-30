import { AzureOpenAI } from 'openai';
import { AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT } from '$env/static/private';

let client: AzureOpenAI | null = null;

export function getOpenAIClient(): AzureOpenAI {
	if (!client) {
		client = new AzureOpenAI({
			endpoint: AZURE_OPENAI_ENDPOINT,
			apiKey: AZURE_OPENAI_KEY,
			apiVersion: '2024-10-21'
		});
	}
	return client;
}

export function getDeploymentName(): string {
	return AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';
}

export function isLLMConfigured(): boolean {
	return Boolean(AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY);
}
