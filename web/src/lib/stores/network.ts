import { writable } from "svelte/store";

interface NetworkState {
  isOnline: boolean;
}

function createNetworkStore() {
  const { subscribe, set } = writable<NetworkState>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  });

  return {
    subscribe,
    setOnline: () => set({ isOnline: true }),
    setOffline: () => set({ isOnline: false }),
  };
}

export const networkStore = createNetworkStore();
