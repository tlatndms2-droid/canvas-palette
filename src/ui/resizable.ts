export function makeHorizontalDivider(divider: HTMLElement, onMove: (clientX: number) => void): void {
  divider.addEventListener("pointerdown", (event) => {
    event.preventDefault(); divider.setPointerCapture(event.pointerId); document.body.addClass("cp-is-resizing");
    const move = (pointer: PointerEvent) => onMove(pointer.clientX);
    const end = () => { document.body.removeClass("cp-is-resizing"); divider.removeEventListener("pointermove", move); divider.removeEventListener("pointerup", end); divider.removeEventListener("pointercancel", end); };
    divider.addEventListener("pointermove", move); divider.addEventListener("pointerup", end); divider.addEventListener("pointercancel", end);
  });
}

export function makeVerticalDivider(divider: HTMLElement, onMove: (clientY: number) => void): void {
  divider.addEventListener("pointerdown", (event) => {
    event.preventDefault(); divider.setPointerCapture(event.pointerId); document.body.addClass("cp-is-resizing");
    const move = (pointer: PointerEvent) => onMove(pointer.clientY);
    const end = () => { document.body.removeClass("cp-is-resizing"); divider.removeEventListener("pointermove", move); divider.removeEventListener("pointerup", end); divider.removeEventListener("pointercancel", end); };
    divider.addEventListener("pointermove", move); divider.addEventListener("pointerup", end); divider.addEventListener("pointercancel", end);
  });
}
