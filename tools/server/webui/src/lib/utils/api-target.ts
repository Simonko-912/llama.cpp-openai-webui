/**
 * Resolve OpenAI-compatible HTTP(S) API base URL and optional CORS proxy routing.
 */

import { browser } from '$app/environment';
import { base } from '$app/paths';
import { config } from '$lib/stores/settings.svelte';
import { getAuthHeaders } from './api-headers';
import { getProxiedUrlString, buildProxiedHeaders } from './cors-proxy';

/** Resolved target for chat/completions and GET /v1/models (per server or global). */
export interface OpenAiConnectionContext {
	baseUrl: string;
	apiKey?: string;
	useCorsProxy: boolean;
}

/** Persisted OpenAI-compatible server + manual model ids (settings JSON). */
export interface OpenAiServerProfileStored {
	name?: string;
	baseUrl?: string;
	apiKey?: string;
	useCorsProxy?: boolean;
	models?: OpenAiManagedModelEntry[];
}

export function isRemoteOpenAiApi(): boolean {
	const cfg = config();
	if (cfg.openAiApiBaseUrl?.toString().trim()) return true;
	for (const p of parseOpenAiServerProfilesFromConfig(cfg as Record<string, unknown>)) {
		if (p.baseUrl?.toString().trim()) return true;
		if ((p.models?.length ?? 0) > 0) return true;
	}
	return false;
}

/**
 * Normalize user-entered base URL: ensures a /v1 path when only origin is given
 * (e.g. https://api.openai.com → https://api.openai.com/v1).
 */
export function normalizeOpenAiApiBaseUrl(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return '';

	const u = new URL(trimmed);
	if (!u.pathname || u.pathname === '/') {
		u.pathname = '/v1';
	}

	let out = u.toString();
	if (out.endsWith('/')) {
		out = out.slice(0, -1);
	}
	return out;
}

export function getSameOriginOpenAiRoot(): string {
	const b = base.endsWith('/') ? base.slice(0, -1) : base;
	const joined = `${b}/v1`;
	return joined.replace(/([^:]\/)\/+/g, '$1');
}

function getResolvedOpenAiRoot(): string {
	const custom = config().openAiApiBaseUrl?.toString().trim();
	if (custom) {
		return normalizeOpenAiApiBaseUrl(custom);
	}
	return getSameOriginOpenAiRoot();
}

/**
 * Absolute URL for an OpenAI-compatible resource path (no leading slash), e.g. models, chat/completions.
 */
export function resolveOpenAiHttpUrl(subpath: string): string {
	const root = getResolvedOpenAiRoot();
	const sub = subpath.replace(/^\/+/, '');
	const joined = `${root}/${sub}`;
	return joined.replace(/([^:]\/)\/+/g, '$1');
}

export function shouldProxyOpenAiUrl(targetUrl: string, useCorsProxy: boolean): boolean {
	if (!browser || !useCorsProxy) return false;
	if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) return false;
	try {
		return new URL(targetUrl).origin !== window.location.origin;
	} catch {
		return false;
	}
}

export function shouldProxyOpenAiRequest(targetUrl: string): boolean {
	return shouldProxyOpenAiUrl(targetUrl, config().openAiApiUseCorsProxy);
}

function joinOpenAiSubpath(root: string, subpath: string): string {
	const r = root.replace(/\/+$/, '');
	const sub = subpath.replace(/^\/+/, '');
	const joined = `${r}/${sub}`;
	return joined.replace(/([^:]\/)\/+/g, '$1');
}

/**
 * Build fetch URL and headers for OpenAI-compatible endpoints, optionally via llama-server CORS proxy.
 */
export function prepareOpenAiFetchResolved(
	subpath: string,
	headers: Record<string, string>,
	root: string,
	useCorsProxy: boolean
): { url: string; headers: Record<string, string> } {
	const targetUrl = joinOpenAiSubpath(root, subpath);
	if (shouldProxyOpenAiUrl(targetUrl, useCorsProxy)) {
		return {
			url: getProxiedUrlString(targetUrl),
			headers: {
				...getAuthHeaders(),
				...buildProxiedHeaders(headers)
			}
		};
	}
	return { url: targetUrl, headers };
}

/**
 * Same host as this web UI (llama-server), ignoring optional global OpenAI base URL.
 */
export function prepareOpenAiFetchSameOrigin(
	subpath: string,
	headers: Record<string, string>
): { url: string; headers: Record<string, string> } {
	const useProxy = Boolean(config().openAiApiUseCorsProxy);
	return prepareOpenAiFetchResolved(subpath, headers, getSameOriginOpenAiRoot(), useProxy);
}

export function prepareOpenAiFetchWithContext(
	subpath: string,
	headers: Record<string, string>,
	ctx: OpenAiConnectionContext
): { url: string; headers: Record<string, string> } {
	return prepareOpenAiFetchResolved(subpath, headers, ctx.baseUrl, ctx.useCorsProxy);
}

/**
 * Build fetch URL and headers for OpenAI-compatible endpoints, optionally via llama-server CORS proxy.
 */
export function prepareOpenAiFetch(
	subpath: string,
	headers: Record<string, string>
): { url: string; headers: Record<string, string> } {
	return prepareOpenAiFetchResolved(
		subpath,
		headers,
		getResolvedOpenAiRoot(),
		Boolean(config().openAiApiUseCorsProxy)
	);
}

export function buildGlobalOpenAiConnectionFromConfig(): OpenAiConnectionContext | undefined {
	const cfg = config();
	const url = cfg.openAiApiBaseUrl?.toString().trim();
	if (!url) return undefined;
	return {
		baseUrl: normalizeOpenAiApiBaseUrl(url),
		apiKey: cfg.apiKey?.toString().trim() || undefined,
		useCorsProxy: Boolean(cfg.openAiApiUseCorsProxy)
	};
}

export function openAiConnectionRootKey(root: string): string {
	if (!browser) return root.trim().replace(/\/+$/, '');
	try {
		const url =
			root.startsWith('http://') || root.startsWith('https://')
				? new URL(root)
				: new URL(root.startsWith('/') ? root : `/${root}`, window.location.origin);
		const path = url.pathname.replace(/\/+$/, '') || '';
		return `${url.origin}${path}`;
	} catch {
		return root.trim().replace(/\/+$/, '');
	}
}

export function openAiRootsEffectivelyEqual(a: string, b: string): boolean {
	return openAiConnectionRootKey(a) === openAiConnectionRootKey(b);
}

export function openAiConnectionFetchKey(ctx: OpenAiConnectionContext): string {
	return `${openAiConnectionRootKey(ctx.baseUrl)}|${ctx.apiKey ?? ''}|${String(ctx.useCorsProxy)}`;
}

export function resolveOpenAiConnectionForProfile(
	profile: OpenAiServerProfileStored,
	cfg: Record<string, unknown>
): OpenAiConnectionContext {
	const apiKeyFromCfg = typeof cfg.apiKey === 'string' ? cfg.apiKey : '';
	const proxyFromCfg = Boolean(cfg.openAiApiUseCorsProxy);
	const globalBase = typeof cfg.openAiApiBaseUrl === 'string' ? cfg.openAiApiBaseUrl.trim() : '';

	const pBase = profile.baseUrl?.toString().trim() ?? '';
	const baseUrlRaw = pBase || globalBase;
	const baseUrl = baseUrlRaw ? normalizeOpenAiApiBaseUrl(baseUrlRaw) : getSameOriginOpenAiRoot();

	const pKey = profile.apiKey?.toString().trim() ?? '';
	const apiKey = pKey || apiKeyFromCfg.trim() || undefined;

	return {
		baseUrl,
		apiKey,
		useCorsProxy: profile.useCorsProxy ?? proxyFromCfg
	};
}

function dedupeProfiles(profiles: OpenAiServerProfileStored[]): OpenAiServerProfileStored[] {
	return profiles.map((p) => ({
		name: p.name?.trim() ? p.name.trim() : undefined,
		baseUrl: p.baseUrl?.trim() ? p.baseUrl.trim() : undefined,
		apiKey: p.apiKey?.trim() ? p.apiKey.trim() : undefined,
		useCorsProxy: p.useCorsProxy,
		models: p.models?.length ? dedupeManagedEntries(p.models) : []
	}));
}

function parseServerProfilesJson(raw: unknown): OpenAiServerProfileStored[] {
	if (typeof raw !== 'string' || !raw.trim()) return [];
	try {
		const data = JSON.parse(raw) as unknown;
		if (!Array.isArray(data)) return [];
		const out: OpenAiServerProfileStored[] = [];
		for (const item of data) {
			if (!item || typeof item !== 'object') continue;
			const rec = item as Record<string, unknown>;
			const modelsRaw = rec.models;
			let models: OpenAiManagedModelEntry[] | undefined;
			if (Array.isArray(modelsRaw)) {
				models = [];
				for (const m of modelsRaw) {
					if (!m || typeof m !== 'object') continue;
					const mr = m as { id?: unknown; label?: unknown };
					if (typeof mr.id !== 'string' || !mr.id.trim()) continue;
					const label = mr.label;
					models.push({
						id: mr.id.trim(),
						label: typeof label === 'string' && label.trim() ? label.trim() : undefined
					});
				}
				models = dedupeManagedEntries(models);
			}
			const useCors = rec.useCorsProxy;
			out.push({
				name: typeof rec.name === 'string' ? rec.name : undefined,
				baseUrl: typeof rec.baseUrl === 'string' ? rec.baseUrl : undefined,
				apiKey: typeof rec.apiKey === 'string' ? rec.apiKey : undefined,
				useCorsProxy: typeof useCors === 'boolean' ? useCors : undefined,
				models
			});
		}
		return out;
	} catch {
		return [];
	}
}

/**
 * Server profiles from settings, or one synthetic profile from legacy `openAiManagedModels`.
 */
export function parseOpenAiServerProfilesFromConfig(cfg: Record<string, unknown>): OpenAiServerProfileStored[] {
	const fromNew = dedupeProfiles(parseServerProfilesJson(cfg.openAiServerProfiles));
	if (fromNew.length > 0) return fromNew;

	const managedOnly = parseManagedModelsJson(cfg.openAiManagedModels);
	if (managedOnly.length === 0) {
		const legacy = parseOpenAiCustomModelIds(cfg.openAiCustomModels);
		if (legacy.length === 0) return [];
		return [{ models: legacy.map((id) => ({ id })) }];
	}
	return [{ models: managedOnly }];
}

export function serializeOpenAiServerProfiles(profiles: OpenAiServerProfileStored[]): string {
	return JSON.stringify(dedupeProfiles(profiles));
}

export function legacyManagedModelsFromProfiles(profiles: OpenAiServerProfileStored[]): OpenAiManagedModelEntry[] {
	const merged: OpenAiManagedModelEntry[] = [];
	for (const p of profiles) {
		if (p.models?.length) merged.push(...p.models);
	}
	return dedupeManagedEntries(merged);
}

export function openAiPathFromApiFetchPath(path: string): string {
	const trimmed = path.replace(/^\/+/, '');
	const withoutV1 = trimmed.startsWith('v1/') ? trimmed.slice(3) : trimmed;
	return withoutV1.replace(/^\/+/, '') || 'models';
}

export function parseOpenAiCustomModelIds(raw: unknown): string[] {
	const s = typeof raw === 'string' ? raw : '';
	const parts = s
		.split(/[\n,]+/)
		.map((x) => x.trim())
		.filter(Boolean);
	return [...new Set(parts)];
}

export interface OpenAiManagedModelEntry {
	id: string;
	label?: string;
}

function dedupeManagedEntries(entries: OpenAiManagedModelEntry[]): OpenAiManagedModelEntry[] {
	const seen = new Set<string>();
	const out: OpenAiManagedModelEntry[] = [];
	for (const e of entries) {
		const id = e.id.trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const label = e.label?.trim();
		out.push({
			id,
			label: label ? label : undefined
		});
	}
	return out;
}

function parseManagedModelsJson(raw: unknown): OpenAiManagedModelEntry[] {
	if (typeof raw !== 'string' || !raw.trim()) return [];
	try {
		const data = JSON.parse(raw) as unknown;
		if (!Array.isArray(data)) return [];
		const out: OpenAiManagedModelEntry[] = [];
		for (const item of data) {
			if (!item || typeof item !== 'object') continue;
			const rec = item as { id?: unknown; label?: unknown };
			if (typeof rec.id !== 'string' || !rec.id.trim()) continue;
			const label = rec.label;
			out.push({
				id: rec.id.trim(),
				label: typeof label === 'string' && label.trim() ? label.trim() : undefined
			});
		}
		return dedupeManagedEntries(out);
	} catch {
		return [];
	}
}

/**
 * Custom OpenAI-compatible models from settings: server profiles, JSON list, or legacy `openAiCustomModels` text.
 */
export function parseOpenAiManagedModelsFromConfig(cfg: Record<string, unknown>): OpenAiManagedModelEntry[] {
	const profiles = parseOpenAiServerProfilesFromConfig(cfg);
	if (profiles.length > 0) {
		const flat = legacyManagedModelsFromProfiles(profiles);
		if (flat.length > 0) return flat;
	}
	const fromJson = parseManagedModelsJson(cfg.openAiManagedModels);
	if (fromJson.length > 0) return fromJson;
	const legacy = parseOpenAiCustomModelIds(cfg.openAiCustomModels);
	return legacy.map((id) => ({ id }));
}

export function serializeOpenAiManagedModels(entries: OpenAiManagedModelEntry[]): string {
	return JSON.stringify(dedupeManagedEntries(entries));
}

/** Keep legacy key in sync for export / older builds. */
export function legacyOpenAiCustomModelsTextFromManaged(entries: OpenAiManagedModelEntry[]): string {
	return dedupeManagedEntries(entries)
		.map((e) => e.id)
		.join('\n');
}
