import type { Dispatch, SetStateAction, ComponentType, ReactNode } from "react";

export type ArtifactKind = "code" | "text" | "image" | "sheet";

export interface UIArtifact {
	id: string;
	channelId: string | null;
	kind: ArtifactKind;
	title: string;
	content: string;
	metadata: Record<string, any> | null;
	version: number;
	status: "idle" | "streaming";
	isVisible: boolean;
}

export type ArtifactActionContext<M = any> = {
	content: string;
	handleVersionChange: (type: "next" | "prev" | "toggle" | "latest") => void;
	currentVersionIndex: number;
	isCurrentVersion: boolean;
	mode: "view" | "diff";
	metadata: M;
	setMetadata: Dispatch<SetStateAction<M>>;
};

export type ArtifactStreamPart = {
	type: string;
	data: any;
};

export type ArtifactToolbarContext = {
	sendMessage: (text: string) => void;
};

export type ArtifactToolbarItem = {
	description: string;
	icon: ReactNode;
	onClick: (ctx: ArtifactToolbarContext) => void;
};

type ArtifactAction<M = any> = {
	icon: ReactNode;
	label?: string;
	description: string;
	onClick: (ctx: ArtifactActionContext<M>) => Promise<void> | void;
	isDisabled?: (ctx: ArtifactActionContext<M>) => boolean;
};

export type ArtifactContentProps<M = any> = {
	title: string;
	content: string;
	mode: "view" | "diff";
	isCurrentVersion: boolean;
	currentVersionIndex: number;
	status: "streaming" | "idle";
	onSaveContent: (updated: string, debounce: boolean) => void;
	isLoading: boolean;
	metadata: M;
	setMetadata: Dispatch<SetStateAction<M>>;
	getVersionContentById: (index: number) => string;
};

type ArtifactConfig<T extends string, M = any> = {
	kind: T;
	description: string;
	content: ComponentType<ArtifactContentProps<M>>;
	actions: ArtifactAction<M>[];
	toolbar: ArtifactToolbarItem[];
	initialize?: (params: {
		artifactId: string;
		setMetadata: Dispatch<SetStateAction<M>>;
	}) => void | Promise<void>;
	onStreamPart?: (args: {
		streamPart: ArtifactStreamPart;
		setArtifact: Dispatch<SetStateAction<UIArtifact>>;
		setMetadata: Dispatch<SetStateAction<M>>;
	}) => void;
};

export class Artifact<T extends string, M = any> {
	readonly kind: T;
	readonly description: string;
	readonly content: ComponentType<ArtifactContentProps<M>>;
	readonly actions: ArtifactAction<M>[];
	readonly toolbar: ArtifactToolbarItem[];
	readonly initialize: (params: {
		artifactId: string;
		setMetadata: Dispatch<SetStateAction<M>>;
	}) => void | Promise<void>;
	readonly onStreamPart: (args: {
		streamPart: ArtifactStreamPart;
		setArtifact: Dispatch<SetStateAction<UIArtifact>>;
		setMetadata: Dispatch<SetStateAction<M>>;
	}) => void;

	constructor(config: ArtifactConfig<T, M>) {
		this.kind = config.kind;
		this.description = config.description;
		this.content = config.content;
		this.actions = config.actions ?? [];
		this.toolbar = config.toolbar ?? [];
		this.initialize = config.initialize ?? (() => {});
		this.onStreamPart = config.onStreamPart ?? (() => {});
	}
}
