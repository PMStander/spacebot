import { create } from "zustand";
import type { UIArtifact } from "@/components/create-artifact";

interface ArtifactStore {
	artifact: UIArtifact | null;
	metadata: Record<string, any>;
	versions: string[];
	setArtifact: (updater: UIArtifact | ((current: UIArtifact | null) => UIArtifact | null)) => void;
	setMetadata: (updater: Record<string, any> | ((current: Record<string, any>) => Record<string, any>)) => void;
	pushVersion: (content: string) => void;
	clearArtifact: () => void;
}

export const useArtifactStore = create<ArtifactStore>((set) => ({
	artifact: null,
	metadata: {},
	versions: [],
	setArtifact: (updater) =>
		set((state) => ({
			artifact: typeof updater === "function" ? updater(state.artifact) : updater,
		})),
	setMetadata: (updater) =>
		set((state) => ({
			metadata: typeof updater === "function" ? updater(state.metadata) : updater,
		})),
	pushVersion: (content) =>
		set((state) => {
			if (state.versions[state.versions.length - 1] === content) {
				return {};
			}
			return { versions: [...state.versions, content] };
		}),
	clearArtifact: () => set({ artifact: null, metadata: {}, versions: [] }),
}));
