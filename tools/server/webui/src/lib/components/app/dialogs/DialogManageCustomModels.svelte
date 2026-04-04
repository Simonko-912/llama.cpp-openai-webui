<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import Label from '$lib/components/ui/label/label.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Plus, Trash2 } from '@lucide/svelte';
	import { config, settingsStore } from '$lib/stores/settings.svelte';
	import { modelsStore } from '$lib/stores/models.svelte';
	import { customModelsDialogStore } from '$lib/stores/custom-models-dialog.svelte';
	import {
		parseOpenAiServerProfilesFromConfig,
		serializeOpenAiServerProfiles,
		legacyManagedModelsFromProfiles,
		serializeOpenAiManagedModels,
		legacyOpenAiCustomModelsTextFromManaged,
		normalizeOpenAiApiBaseUrl,
		type OpenAiServerProfileStored,
		type OpenAiManagedModelEntry
	} from '$lib/utils/api-target';

	type ModelRow = { id: string; label: string };

	type ServerRow = {
		name: string;
		baseUrl: string;
		apiKey: string;
		useCorsProxy: boolean;
		models: ModelRow[];
	};

	function emptyModelRow(): ModelRow {
		return { id: '', label: '' };
	}

	function emptyServer(): ServerRow {
		return {
			name: '',
			baseUrl: '',
			apiKey: '',
			useCorsProxy: false,
			models: [emptyModelRow()]
		};
	}

	let servers = $state<ServerRow[]>([]);
	/** One load from settings per dialog open; avoids resets if $effect re-runs while open. */
	let loadedForCurrentOpen = $state(false);

	function loadFromConfig() {
		const profiles = parseOpenAiServerProfilesFromConfig(config() as Record<string, unknown>);
		servers = profiles.map((p) => ({
			name: p.name ?? '',
			baseUrl: p.baseUrl ?? '',
			apiKey: p.apiKey ?? '',
			useCorsProxy: Boolean(p.useCorsProxy),
			models:
				p.models && p.models.length > 0
					? p.models.map((m) => ({ id: m.id, label: m.label ?? '' }))
					: [emptyModelRow()]
		}));
		if (servers.length === 0) {
			servers = [emptyServer()];
		}
	}

	/**
	 * Reload draft from saved settings once when the dialog opens.
	 * `loadFromConfig` reads `config()`; it must run inside `untrack` so reactive
	 * settings updates are not effect dependencies (that was wiping inputs each keystroke).
	 */
	$effect(() => {
		const open = customModelsDialogStore.isOpen;
		if (!open) {
			loadedForCurrentOpen = false;
			return;
		}
		if (loadedForCurrentOpen) return;
		loadedForCurrentOpen = true;
		untrack(() => loadFromConfig());
	});

	function addServer() {
		servers = [...servers, emptyServer()];
	}

	function removeServer(si: number) {
		servers = servers.filter((_, i) => i !== si);
		if (servers.length === 0) {
			servers = [emptyServer()];
		}
	}

	function addModelRow(si: number) {
		servers = servers.map((s, i) =>
			i === si ? { ...s, models: [...s.models, emptyModelRow()] } : s
		);
	}

	function removeModelRow(si: number, mi: number) {
		servers = servers.map((s, i) => {
			if (i !== si) return s;
			const next = s.models.filter((_, j) => j !== mi);
			return { ...s, models: next.length > 0 ? next : [emptyModelRow()] };
		});
	}

	function handleCancel() {
		customModelsDialogStore.setOpen(false);
	}

	function handleSave() {
		const out: OpenAiServerProfileStored[] = [];

		for (let si = 0; si < servers.length; si++) {
			const s = servers[si];
			const baseRaw = s.baseUrl.trim();
			if (baseRaw) {
				try {
					new URL(normalizeOpenAiApiBaseUrl(baseRaw));
				} catch {
					alert(
						`Invalid base URL for server ${si + 1}. Use http:// or https:// with a valid host (include /v1 if required).`
					);
					return;
				}
			}

			const models: OpenAiManagedModelEntry[] = s.models
				.map((m) => ({
					id: m.id.trim(),
					label: m.label.trim() ? m.label.trim() : undefined
				}))
				.filter((m) => m.id.length > 0);

			const ids = models.map((m) => m.id);
			if (new Set(ids).size !== ids.length) {
				alert(`Duplicate model ids in server ${si + 1} are not allowed.`);
				return;
			}

			const name = s.name.trim();
			const key = s.apiKey.trim();
			const hasPayload =
				baseRaw.length > 0 || models.length > 0 || name.length > 0 || key.length > 0;

			if (!hasPayload) continue;

			out.push({
				name: name || undefined,
				baseUrl: baseRaw ? normalizeOpenAiApiBaseUrl(baseRaw) : undefined,
				apiKey: key || undefined,
				useCorsProxy: s.useCorsProxy,
				models: models.length > 0 ? models : undefined
			});
		}

		const flat = legacyManagedModelsFromProfiles(out);
		const serializedProfiles = serializeOpenAiServerProfiles(out);
		const serializedManaged = serializeOpenAiManagedModels(flat);
		const legacy = legacyOpenAiCustomModelsTextFromManaged(flat);

		settingsStore.updateMultipleConfig({
			openAiServerProfiles: serializedProfiles,
			openAiManagedModels: serializedManaged,
			openAiCustomModels: legacy
		});

		modelsStore
			.fetch(true)
			.catch((err) => console.warn('Failed to refresh models after saving server profiles', err));

		customModelsDialogStore.setOpen(false);
	}
</script>

<Dialog.Root
	open={customModelsDialogStore.isOpen}
	onOpenChange={(v: boolean) => customModelsDialogStore.setOpen(v)}
>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Manage OpenAI-compatible servers</Dialog.Title>

			<Dialog.Description>
				Add one block per API: optional display name, base URL (with <code class="text-xs">/v1</code> if
				needed), optional API key, and model ids sent as the <code class="text-xs">model</code> field.
				Leave base URL empty to use the same target as <strong>General → OpenAI-compatible API base URL</strong>
				(or this host if that is empty). Models from <code class="text-xs">GET /v1/models</code> are merged per
				server when the URL is reachable.
			</Dialog.Description>
		</Dialog.Header>

		<ScrollArea class="max-h-[min(55vh,28rem)] pr-3">
			<div class="flex flex-col gap-4">
				{#each servers as server, si (si)}
					<div class="space-y-3 rounded-md border border-border/60 p-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<span class="text-sm font-medium text-foreground">Server {si + 1}</span>

							<Button
								type="button"
								variant="ghost"
								size="icon"
								class="text-muted-foreground hover:text-destructive"
								title="Remove server"
								aria-label="Remove server"
								onclick={() => removeServer(si)}
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>

						<div class="grid gap-3 sm:grid-cols-2">
							<div class="space-y-1.5 sm:col-span-2">
								<Label for="srv-name-{si}" class="text-xs">Display name (optional)</Label>

								<Input
									id="srv-name-{si}"
									placeholder="e.g. OpenRouter"
									bind:value={
										() => servers[si].name,
										(v) => {
											const next = typeof v === 'string' ? v : String(v ?? '');
											servers = servers.map((s, i) => (i === si ? { ...s, name: next } : s));
										}
									}
								/>
							</div>

							<div class="space-y-1.5 sm:col-span-2">
								<Label for="srv-url-{si}" class="text-xs">Base URL (optional)</Label>

								<Input
									id="srv-url-{si}"
									placeholder="https://api.example.com/v1"
									bind:value={
										() => servers[si].baseUrl,
										(v) => {
											const next = typeof v === 'string' ? v : String(v ?? '');
											servers = servers.map((s, i) => (i === si ? { ...s, baseUrl: next } : s));
										}
									}
								/>
							</div>

							<div class="space-y-1.5 sm:col-span-2">
								<Label for="srv-key-{si}" class="text-xs">API key (optional)</Label>

								<Input
									id="srv-key-{si}"
									type="password"
									autocomplete="off"
									placeholder="Bearer token for this server"
									bind:value={
										() => servers[si].apiKey,
										(v) => {
											const next = typeof v === 'string' ? v : String(v ?? '');
											servers = servers.map((s, i) => (i === si ? { ...s, apiKey: next } : s));
										}
									}
								/>
							</div>

							<div class="flex items-center gap-2 sm:col-span-2">
								<Checkbox
									id="srv-proxy-{si}"
									checked={server.useCorsProxy}
									onCheckedChange={(v) => {
										servers = servers.map((s, i) =>
											i === si ? { ...s, useCorsProxy: Boolean(v) } : s
										);
									}}
								/>

								<Label for="srv-proxy-{si}" class="text-xs font-normal leading-none">
									Use CORS proxy for this server
								</Label>
							</div>
						</div>

						<div class="space-y-2">
							<span class="text-xs font-medium text-muted-foreground">Models</span>

							{#each server.models as modelRow, mi (mi)}
								<div
									class="grid gap-2 rounded-md border border-border/40 p-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
								>
									<div class="space-y-1.5">
										<Label for="m-id-{si}-{mi}" class="text-xs">Model id</Label>

										<Input
											id="m-id-{si}-{mi}"
											placeholder="e.g. gpt-4o"
											bind:value={
												() => servers[si].models[mi].id,
												(v) => {
													const next = typeof v === 'string' ? v : String(v ?? '');
													servers = servers.map((s, i) => {
														if (i !== si) return s;
														return {
															...s,
															models: s.models.map((m, j) =>
																j === mi ? { ...m, id: next } : m
															)
														};
													});
												}
											}
										/>
									</div>

									<div class="space-y-1.5">
										<Label for="m-label-{si}-{mi}" class="text-xs">Display name (optional)</Label>

										<Input
											id="m-label-{si}-{mi}"
											placeholder="Shown in the list"
											bind:value={
												() => servers[si].models[mi].label,
												(v) => {
													const next = typeof v === 'string' ? v : String(v ?? '');
													servers = servers.map((s, i) => {
														if (i !== si) return s;
														return {
															...s,
															models: s.models.map((m, j) =>
																j === mi ? { ...m, label: next } : m
															)
														};
													});
												}
											}
										/>
									</div>

									<div class="flex justify-end sm:pb-0.5">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											class="text-muted-foreground hover:text-destructive"
											title="Remove model"
											aria-label="Remove model"
											onclick={() => removeModelRow(si, mi)}
										>
											<Trash2 class="h-4 w-4" />
										</Button>
									</div>
								</div>
							{/each}

							<Button
								type="button"
								variant="outline"
								size="sm"
								class="w-full gap-1 sm:w-auto"
								onclick={() => addModelRow(si)}
							>
								<Plus class="h-3.5 w-3.5" />

								Add model
							</Button>
						</div>
					</div>
				{/each}
			</div>
		</ScrollArea>

		<Button type="button" variant="outline" size="sm" class="w-full gap-1 sm:w-auto" onclick={addServer}>
			<Plus class="h-3.5 w-3.5" />

			Add server
		</Button>

		<Dialog.Footer class="gap-2 sm:gap-0">
			<Button type="button" variant="outline" onclick={handleCancel}>Cancel</Button>

			<Button type="button" onclick={handleSave}>Save</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
