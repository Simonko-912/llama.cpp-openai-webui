import { base } from '$app/paths';
import { getJsonHeaders, getAuthHeaders, getJsonHeadersWithOpenAiKey } from './api-headers';
import { UrlProtocol } from '$lib/enums';
import {
	prepareOpenAiFetch,
	prepareOpenAiFetchSameOrigin,
	prepareOpenAiFetchWithContext,
	openAiPathFromApiFetchPath,
	type OpenAiConnectionContext
} from './api-target';

/**
 * API Fetch Utilities
 *
 * Provides common fetch patterns used across services:
 * - Automatic JSON headers
 * - Error handling with proper error messages
 * - Base path resolution
 */

export interface ApiFetchOptions extends Omit<RequestInit, 'headers'> {
	/**
	 * Use auth-only headers (no Content-Type).
	 * Default: false (uses JSON headers with Content-Type: application/json)
	 */
	authOnly?: boolean;
	/**
	 * Additional headers to merge with default headers.
	 */
	headers?: Record<string, string>;
	/**
	 * For `/v1/*` paths: target OpenAI-compatible server (default uses global base URL or same host).
	 */
	openAiConnection?: OpenAiConnectionContext | 'same-origin';
}

/**
 * Fetch JSON data from an API endpoint with standard headers and error handling.
 *
 * @param path - API path (will be prefixed with base path)
 * @param options - Fetch options with additional authOnly flag
 * @returns Parsed JSON response
 * @throws Error with formatted message on failure
 *
 * @example
 * ```typescript
 * // GET request
 * const models = await apiFetch<ApiModelListResponse>('/v1/models');
 *
 * // POST request
 * const result = await apiFetch<ApiResponse>('/models/load', {
 *   method: 'POST',
 *   body: JSON.stringify({ model: 'gpt-4' })
 * });
 * ```
 */
function isOpenAiCompatibleFetchPath(path: string): boolean {
	if (path.startsWith(UrlProtocol.HTTP) || path.startsWith(UrlProtocol.HTTPS)) {
		return false;
	}
	const p = path.startsWith('/') ? path : `/${path}`;
	return p === '/v1/models' || p.startsWith('/v1/');
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
	const { authOnly = false, headers: customHeaders, openAiConnection, ...fetchOptions } = options;

	let baseHeaders = authOnly ? getAuthHeaders() : getJsonHeaders();
	if (openAiConnection && typeof openAiConnection === 'object' && !authOnly) {
		baseHeaders = getJsonHeadersWithOpenAiKey(openAiConnection.apiKey);
	}
	const headers = { ...baseHeaders, ...customHeaders };

	let url: string;
	let finalHeaders = headers;

	if (path.startsWith(UrlProtocol.HTTP) || path.startsWith(UrlProtocol.HTTPS)) {
		url = path;
	} else if (isOpenAiCompatibleFetchPath(path)) {
		const subpath = openAiPathFromApiFetchPath(path);
		let prepared;
		if (openAiConnection === 'same-origin') {
			prepared = prepareOpenAiFetchSameOrigin(subpath, headers);
		} else if (openAiConnection && typeof openAiConnection === 'object') {
			prepared = prepareOpenAiFetchWithContext(subpath, headers, openAiConnection);
		} else {
			prepared = prepareOpenAiFetch(subpath, headers);
		}
		url = prepared.url;
		finalHeaders = prepared.headers;
	} else {
		url = `${base}${path}`;
	}

	const response = await fetch(url, {
		...fetchOptions,
		headers: finalHeaders
	});

	if (!response.ok) {
		const errorMessage = await parseErrorMessage(response);
		throw new Error(errorMessage);
	}

	return response.json() as Promise<T>;
}

/**
 * Fetch with URL constructed from base URL and query parameters.
 *
 * @param basePath - Base API path
 * @param params - Query parameters to append
 * @param options - Fetch options
 * @returns Parsed JSON response
 *
 * @example
 * ```typescript
 * const props = await apiFetchWithParams<ApiProps>('./props', {
 *   model: 'gpt-4',
 *   autoload: 'false'
 * });
 * ```
 */
export async function apiFetchWithParams<T>(
	basePath: string,
	params: Record<string, string>,
	options: ApiFetchOptions = {}
): Promise<T> {
	const url = new URL(basePath, window.location.href);

	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null) {
			url.searchParams.set(key, value);
		}
	}

	const { authOnly = false, headers: customHeaders, ...fetchOptions } = options;

	const baseHeaders = authOnly ? getAuthHeaders() : getJsonHeaders();
	const headers = { ...baseHeaders, ...customHeaders };

	const response = await fetch(url.toString(), {
		...fetchOptions,
		headers
	});

	if (!response.ok) {
		const errorMessage = await parseErrorMessage(response);
		throw new Error(errorMessage);
	}

	return response.json() as Promise<T>;
}

/**
 * POST JSON data to an API endpoint.
 *
 * @param path - API path
 * @param body - Request body (will be JSON stringified)
 * @param options - Additional fetch options
 * @returns Parsed JSON response
 */
export async function apiPost<T, B = unknown>(
	path: string,
	body: B,
	options: ApiFetchOptions = {}
): Promise<T> {
	return apiFetch<T>(path, {
		method: 'POST',
		body: JSON.stringify(body),
		...options
	});
}

/**
 * Parse error message from a failed response.
 * Tries to extract error message from JSON body, falls back to status text.
 */
async function parseErrorMessage(response: Response): Promise<string> {
	try {
		const errorData = await response.json();
		if (errorData?.error?.message) {
			return errorData.error.message;
		}
		if (errorData?.error && typeof errorData.error === 'string') {
			return errorData.error;
		}
		if (errorData?.message) {
			return errorData.message;
		}
	} catch {
		// JSON parsing failed, use status text
	}

	return `Request failed: ${response.status} ${response.statusText}`;
}
