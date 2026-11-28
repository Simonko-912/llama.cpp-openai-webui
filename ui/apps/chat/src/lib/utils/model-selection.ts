import type { ModelOption } from '#lib/types/models.js';

export interface ChatFormModelStateInput {
	conversationModel: string | null;
	isRouter: boolean;
	models: readonly Pick<ModelOption, 'id' | 'model'>[];
	selectedModelId: string | null;
}

export interface ChatFormModelState {
	hasModelSelected: boolean;
	isSelectedModelAvailable: boolean;
}

/**
 * Whether the chat form has a model to send with and whether that model is available.
 * The form's own selection always wins; the conversation's last model only counts
 * when nothing is selected in the form.
 */
export function getChatFormModelState({
	conversationModel,
	isRouter,
	models,
	selectedModelId
}: ChatFormModelStateInput): ChatFormModelState {
	if (!isRouter) return { hasModelSelected: true, isSelectedModelAvailable: true };

	// an empty or failed model list cannot validate anything: the endpoint may still
	// answer with the selected model, so a selection stays usable instead of locking
	// the send button red until the next successful fetch
	if (models.length === 0) {
		return {
			hasModelSelected: !!selectedModelId || !!conversationModel,
			isSelectedModelAvailable: !!selectedModelId || !!conversationModel
		};
	}

	if (selectedModelId) {
		return {
			hasModelSelected: true,
			// the id can carry a quant tag while the selection stores the plain name; accept both
			isSelectedModelAvailable: models.some(
				(option) => option.id === selectedModelId || option.model === selectedModelId
			)
		};
	}

	if (conversationModel) {
		return {
			hasModelSelected: true,
			isSelectedModelAvailable: models.some((option) => option.model === conversationModel)
		};
	}

	return { hasModelSelected: false, isSelectedModelAvailable: false };
}
