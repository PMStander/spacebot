/**
 * Artifact type registry — maps kind strings to Artifact definitions.
 * Add new artifact types here as they are implemented.
 */

import { codeArtifact } from "./code/index";
import { textArtifact } from "./text/index";
import { imageArtifact } from "./image/index";
import { sheetArtifact } from "./sheet/index";
import { bookArtifact } from "./book/index";
import type { Artifact, ArtifactKind } from "@/components/create-artifact";

export { codeArtifact } from "./code/index";
export { textArtifact } from "./text/index";
export { imageArtifact } from "./image/index";
export { sheetArtifact } from "./sheet/index";
export { bookArtifact } from "./book/index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const artifactDefinitions: Artifact<ArtifactKind, any>[] = [
	codeArtifact,
	textArtifact,
	imageArtifact,
	sheetArtifact,
	bookArtifact,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const artifactRegistry = new Map<ArtifactKind, Artifact<ArtifactKind, any>>(
	artifactDefinitions.map((a) => [a.kind, a]),
);
