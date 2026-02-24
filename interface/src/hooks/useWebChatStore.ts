import { create } from "zustand";
import { type ToolActivity, type WebChatMessage } from "./useWebChat";

export interface AgentChatState {
	sessionId: string;
	messages: WebChatMessage[];
	isStreaming: boolean;
	error: string | null;
	toolActivity: ToolActivity[];
	streamingText: string;
	hasFetched: boolean;
}

export interface WebChatStore {
	chats: Record<string, AgentChatState>;
	getChat: (agentId: string, defaultSessionId: string) => AgentChatState;
	initChat: (agentId: string, defaultSessionId: string) => void;
	updateChat: (agentId: string, updater: (state: AgentChatState) => Partial<AgentChatState>) => void;
	clearChat: (agentId: string, newSessionId: string) => void;
}

export const useWebChatStore = create<WebChatStore>((set, get) => ({
	chats: {},
	getChat: (agentId, defaultSessionId) => {
		const state = get().chats[agentId];
		if (state) return state;
		return {
			sessionId: defaultSessionId,
			messages: [],
			isStreaming: false,
			error: null,
			toolActivity: [],
			streamingText: "",
			hasFetched: false,
		};
	},
	initChat: (agentId, defaultSessionId) => {
		set((state) => {
			if (state.chats[agentId]) return state;
			return {
				chats: {
					...state.chats,
					[agentId]: {
						sessionId: defaultSessionId,
						messages: [],
						isStreaming: false,
						error: null,
						toolActivity: [],
						streamingText: "",
						hasFetched: false,
					},
				},
			};
		});
	},
	updateChat: (agentId, updater) => {
		set((state) => {
			const current = state.chats[agentId];
			if (!current) return state;
			return {
				chats: {
					...state.chats,
					[agentId]: { ...current, ...updater(current) },
				},
			};
		});
	},
	clearChat: (agentId, newSessionId) => {
		set((state) => ({
			chats: {
				...state.chats,
				[agentId]: {
					sessionId: newSessionId,
					messages: [],
					isStreaming: false,
					error: null,
					toolActivity: [],
					streamingText: "",
					hasFetched: false,
				},
			},
		}));
	},
}));
