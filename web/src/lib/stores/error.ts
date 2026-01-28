import { writable } from "svelte/store";

interface ErrorState {
  message: string | null;
  show: boolean;
}

function createErrorStore() {
  const { subscribe, set, update } = writable<ErrorState>({
    message: null,
    show: false,
  });

  return {
    subscribe,
    showError: (message: string) => {
      set({ message, show: true });
      setTimeout(() => {
        update((state) => ({ ...state, show: false }));
      }, 5000);
    },
    hideError: () => set({ message: null, show: false }),
  };
}

export const errorStore = createErrorStore();
