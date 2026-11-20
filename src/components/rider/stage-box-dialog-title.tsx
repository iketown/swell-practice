import { useEffect, useRef } from "react";
import { GripVertical } from "lucide-react";

function moveDialog(dialog: HTMLDialogElement, x: number, y: number) {
  const inset = 8;
  const { width, height } = dialog.getBoundingClientRect();
  const left = Math.max(
    inset,
    Math.min(x, document.documentElement.clientWidth - width - inset),
  );
  const top = Math.max(inset, Math.min(y, window.innerHeight - height - inset));
  Object.assign(dialog.style, {
    inset: "auto",
    margin: "0",
    top: top + "px",
    left: left + "px",
  });
}

export function StageBoxDialogTitle({ title }: { title: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const dialog = button.current?.closest("dialog");
    if (!dialog) return;
    function keepInView() {
      if (!dialog?.style.left) return;
      const rect = dialog.getBoundingClientRect();
      moveDialog(dialog, rect.left, rect.top);
    }
    const observer = new ResizeObserver(keepInView);
    observer.observe(dialog);
    window.addEventListener("resize", keepInView);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", keepInView);
    };
  }, []);
  return (
    <h2 className="box-dialog-title" aria-label={title}>
      <button
        ref={button}
        className="box-drag-handle"
        type="button"
        aria-label="Move stage box dialog"
        title="Drag to move the dialog, or use the arrow keys"
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary) return;
          const rect = e.currentTarget
            .closest("dialog")!
            .getBoundingClientRect();
          drag.current = {
            pointer: e.pointerId,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current?.pointer !== e.pointerId) return;
          moveDialog(
            e.currentTarget.closest("dialog")!,
            e.clientX - drag.current.x,
            e.clientY - drag.current.y,
          );
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(e) => {
          const delta = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          }[e.key];
          if (!delta) return;
          e.preventDefault();
          const dialog = e.currentTarget.closest("dialog")!;
          const rect = dialog.getBoundingClientRect();
          moveDialog(
            dialog,
            rect.left + delta[0] * 24,
            rect.top + delta[1] * 24,
          );
        }}
      >
        <GripVertical aria-hidden="true" />
        {title}
      </button>
    </h2>
  );
}
