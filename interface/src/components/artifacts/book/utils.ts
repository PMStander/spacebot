/**
 * Construct the URL for a panel image, served through the Axum /api/local-file route.
 *
 * Images live at: {outputDir}/page-{pageNumber}/panel-{panelIndex}.png
 *
 * The panel's `image` filename from comic.json is ignored — we reconstruct
 * the path from the page number and panel index to match the skill's output
 * directory convention.
 */
export function panelImageUrl(
	outputDir: string,
	pageNumber: number,
	panelIndex: number,
): string {
	if (!outputDir) return "";
	const absPath = `${outputDir}/page-${pageNumber}/panel-${panelIndex}.png`;
	return `/api/local-file?path=${encodeURIComponent(absPath)}`;
}
