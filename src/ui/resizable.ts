type ResizeAxis = "column" | "row";

function makeDivider(divider: HTMLElement, axis: ResizeAxis, onMove: (coordinate: number) => void, onEnd?: () => void): void {
  divider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const body = divider.ownerDocument.body;
    const resizeClass = axis === "column" ? "cp-is-resizing--column" : "cp-is-resizing--row";
    let finished = false;
    divider.setPointerCapture(event.pointerId);
    body.addClass("cp-is-resizing", resizeClass);

    const move = (pointer: PointerEvent): void => {
      pointer.preventDefault();
      onMove(axis === "column" ? pointer.clientX : pointer.clientY);
    };
    const end = (): void => {
      if (finished) return;
      finished = true;
      body.removeClass("cp-is-resizing", resizeClass);
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", end);
      divider.removeEventListener("pointercancel", end);
      divider.removeEventListener("lostpointercapture", end);
      onEnd?.();
    };

    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", end);
    divider.addEventListener("pointercancel", end);
    divider.addEventListener("lostpointercapture", end);
  });
}

export function makeHorizontalDivider(divider: HTMLElement, onMove: (clientX: number) => void, onEnd?: () => void): void {
  makeDivider(divider, "column", onMove, onEnd);
}

export function makeVerticalDivider(divider: HTMLElement, onMove: (clientY: number) => void, onEnd?: () => void): void {
  makeDivider(divider, "row", onMove, onEnd);
}
