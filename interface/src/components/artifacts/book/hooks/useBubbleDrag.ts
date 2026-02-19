import { useCallback } from "react";

interface UseBubbleDragOptions {
	/** Called on each pointermove with delta in SVG viewBox coordinates */
	onDrag: (dx: number, dy: number) => void;
}

/**
 * Pointer-event drag hook for SVG elements inside a `viewBox="0 0 100 100"
 * preserveAspectRatio="none"` SVG.
 *
 * Converts screen pixel deltas to SVG viewBox coordinate deltas using
 * SVGSVGElement.getScreenCTM().inverse(). This correctly handles the
 * non-uniform scale introduced by `preserveAspectRatio="none"`.
 *
 * Usage:
 *   const { onPointerDown } = useBubbleDrag({ onDrag: (dx, dy) => ... });
 *   <circle onPointerDown={onPointerDown} />
 */
export function useBubbleDrag({ onDrag }: UseBubbleDragOptions) {
	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			e.stopPropagation();

			// Walk up from the event target to find the owning <svg> element
			const svgEl = (e.currentTarget as Element).closest("svg");
			if (!(svgEl instanceof SVGSVGElement)) return;

			const ctm = svgEl.getScreenCTM();
			if (!ctm) return;
			const inverseCTM = ctm.inverse();

			// Convert the initial pointer position to SVG viewBox space
			let prevPt = new DOMPoint(e.clientX, e.clientY).matrixTransform(inverseCTM);

			const target = e.currentTarget as Element;
			(target as SVGElement).setPointerCapture?.(e.pointerId);

			const onMove = (moveEvent: PointerEvent) => {
				// Re-fetch CTM on each move in case the SVG was resized/scrolled
				const currentCTM = svgEl.getScreenCTM();
				if (!currentCTM) return;
				const currentInverse = currentCTM.inverse();
				const curPt = new DOMPoint(moveEvent.clientX, moveEvent.clientY).matrixTransform(
					currentInverse,
				);
				onDrag(curPt.x - prevPt.x, curPt.y - prevPt.y);
				prevPt = curPt;
			};

			const onUp = () => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		},
		[onDrag],
	);

	return { onPointerDown };
}
