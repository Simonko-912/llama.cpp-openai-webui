import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$app/paths', () => ({ base: '' }));

const mockConfig = vi.fn(() => ({
	openAiApiBaseUrl: '',
	openAiApiUseCorsProxy: false
}));

vi.mock('$lib/stores/settings.svelte', () => ({
	config: () => mockConfig()
}));

import {
	normalizeOpenAiApiBaseUrl,
	openAiPathFromApiFetchPath,
	parseOpenAiCustomModelIds,
	parseOpenAiManagedModelsFromConfig,
	parseOpenAiServerProfilesFromConfig,
	serializeOpenAiManagedModels,
	legacyOpenAiCustomModelsTextFromManaged
} from '$lib/utils/api-target';

describe('normalizeOpenAiApiBaseUrl', () => {
	it('appends /v1 when only origin is given', () => {
		expect(normalizeOpenAiApiBaseUrl('https://api.openai.com')).toBe('https://api.openai.com/v1');
		expect(normalizeOpenAiApiBaseUrl('http://127.0.0.1:1234')).toBe('http://127.0.0.1:1234/v1');
	});

	it('preserves explicit /v1 path', () => {
		expect(normalizeOpenAiApiBaseUrl('https://example.com/v1')).toBe('https://example.com/v1');
	});

	it('strips trailing slash', () => {
		expect(normalizeOpenAiApiBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1');
	});
});

describe('openAiPathFromApiFetchPath', () => {
	it('maps /v1/models to models', () => {
		expect(openAiPathFromApiFetchPath('/v1/models')).toBe('models');
	});

	it('maps /v1/chat/completions to chat/completions', () => {
		expect(openAiPathFromApiFetchPath('/v1/chat/completions')).toBe('chat/completions');
	});
});

describe('parseOpenAiCustomModelIds', () => {
	it('splits on newlines and commas and dedupes', () => {
		expect(parseOpenAiCustomModelIds('a\nb, a , c')).toStrictEqual(['a', 'b', 'c']);
	});
});

describe('parseOpenAiManagedModelsFromConfig', () => {
	it('prefers JSON when non-empty', () => {
		expect(
			parseOpenAiManagedModelsFromConfig({
				openAiManagedModels: JSON.stringify([
					{ id: 'gpt-4o', label: 'Four' },
					{ id: 'x' }
				]),
				openAiCustomModels: 'legacy'
			})
		).toStrictEqual([
			{ id: 'gpt-4o', label: 'Four' },
			{ id: 'x', label: undefined }
		]);
	});

	it('falls back to legacy openAiCustomModels when JSON list is empty', () => {
		expect(
			parseOpenAiManagedModelsFromConfig({
				openAiManagedModels: '[]',
				openAiCustomModels: 'm1\nm2'
			})
		).toStrictEqual([
			{ id: 'm1', label: undefined },
			{ id: 'm2', label: undefined }
		]);
	});

	it('reads server profiles JSON when present', () => {
		const raw = JSON.stringify([
			{
				name: 'R',
				baseUrl: 'https://example.com/v1',
				apiKey: 'k',
				useCorsProxy: true,
				models: [{ id: 'a', label: 'A' }]
			}
		]);
		expect(parseOpenAiServerProfilesFromConfig({ openAiServerProfiles: raw })).toStrictEqual([
			{
				name: 'R',
				baseUrl: 'https://example.com/v1',
				apiKey: 'k',
				useCorsProxy: true,
				models: [{ id: 'a', label: 'A' }]
			}
		]);
	});

	it('serializes and legacy text stay aligned', () => {
		const entries = [{ id: 'a', label: 'A' }, { id: 'b' }];
		expect(serializeOpenAiManagedModels(entries)).toBe('[{"id":"a","label":"A"},{"id":"b"}]');
		expect(legacyOpenAiCustomModelsTextFromManaged(entries)).toBe('a\nb');
	});
});
