/**
 * Artifact type registry — maps kind strings to Artifact definitions.
 * Add new artifact types here as they are implemented.
 */

import { codeArtifact } from "./code/index";
import { textArtifact } from "./text/index";
import { imageArtifact } from "./image/index";
import { sheetArtifact } from "./sheet/index";
import { bookArtifact } from "./book/index";
import { htmlArtifact } from "./html/index";
import { chartArtifact } from "./chart/index";
import { diagramArtifact } from "./diagram/index";
import { checklistArtifact } from "./checklist/index";
import { formArtifact } from "./form/index";
import { kanbanArtifact } from "./kanban/index";
import { tableArtifact } from "./table/index";
import { graphArtifact } from "./graph/index";
import type { Artifact, ArtifactKind } from "@/components/create-artifact";

export { codeArtifact } from "./code/index";
export { textArtifact } from "./text/index";
export { imageArtifact } from "./image/index";
export { sheetArtifact } from "./sheet/index";
export { bookArtifact } from "./book/index";
export { htmlArtifact } from "./html/index";
export { chartArtifact } from "./chart/index";
export { diagramArtifact } from "./diagram/index";
export { checklistArtifact } from "./checklist/index";
export { formArtifact } from "./form/index";
export { kanbanArtifact } from "./kanban/index";
export { tableArtifact } from "./table/index";
export { graphArtifact } from "./graph/index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const artifactDefinitions: Artifact<ArtifactKind, any>[] = [
	codeArtifact,
	textArtifact,
	imageArtifact,
	sheetArtifact,
	bookArtifact,
	htmlArtifact,
	chartArtifact,
	diagramArtifact,
	checklistArtifact,
	formArtifact,
	kanbanArtifact,
	tableArtifact,
	graphArtifact,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const artifactRegistry = new Map<ArtifactKind, Artifact<ArtifactKind, any>>(
	artifactDefinitions.map((a) => [a.kind, a]),
);
