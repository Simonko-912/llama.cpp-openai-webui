/**
 * Opens the global "Manage OpenAI-compatible servers" dialog from the chat bar or from the empty model list.
 */
class CustomModelsDialogStore {
	isOpen = $state(false);

	open(): void {
		this.isOpen = true;
	}

	setOpen(value: boolean): void {
		this.isOpen = value;
	}
}

export const customModelsDialogStore = new CustomModelsDialogStore();
