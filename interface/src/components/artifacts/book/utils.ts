/**
 * Construct the URL for a panel image, served through the Axum /api/local-file route.
 *
 * Preferred source is the panel's `image` field:
 * - absolute path: `/abs/path/to/panel.png`
 * - relative filename: `panel-0.png` (resolved to `{outputDir}/page-{pageNumber}/`)
 * - relative path: `page-1/panel-0.png` (resolved to `{outputDir}/`)
 *
 * Fallback when `image` is missing: `{outputDir}/page-{pageNumber}/panel-{panelIndex}.png`.
 */
export function panelImageUrl(
	outputDir: string,
	pageNumber: number,
	image: string | undefined,
	panelIndex: number,
): string {
	if (image?.startsWith("data:") || image?.startsWith("http://") || image?.startsWith("https://")) {
		return image;
	}

	const normalizedImage = image?.split("\\").join("/");

	let absPath = "";
	if (normalizedImage?.startsWith("/")) {
		absPath = normalizedImage;
	} else if (normalizedImage && outputDir) {
		absPath = normalizedImage.includes("/")
			? `${outputDir}/${normalizedImage}`
			: `${outputDir}/page-${pageNumber}/${normalizedImage}`;
	} else if (outputDir) {
		absPath = `${outputDir}/page-${pageNumber}/panel-${panelIndex}.png`;
	}

	if (!absPath) return "";
	return `/api/local-file?path=${encodeURIComponent(absPath)}`;
}
