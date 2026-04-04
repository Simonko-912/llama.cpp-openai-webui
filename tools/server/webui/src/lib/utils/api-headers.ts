import { config } from '$lib/stores/settings.svelte';

/**
 * Get authorization headers for API requests
 * Includes Bearer token if API key is configured
 */
export function getAuthHeaders(): Record<string, string> {
	const currentConfig = config();
	const apiKey = currentConfig.apiKey?.toString().trim();

	return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

/**
 * Get standard JSON headers with optional authorization
 */
export function getJsonHeaders(): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		...getAuthHeaders()
	};
}

/**
 * JSON headers with Bearer token: explicit key wins, else global Settings API key.
 */
export function getJsonHeadersWithOpenAiKey(apiKeyOverride?: string): Record<string, string> {
	const currentConfig = config();
	const fromOverride = apiKeyOverride?.toString().trim();
	const fromGlobal = currentConfig.apiKey?.toString().trim();
	const token = fromOverride || fromGlobal;

	return {
		'Content-Type': 'application/json',
		...(token ? { Authorization: `Bearer ${token}` } : {})
	};
}
