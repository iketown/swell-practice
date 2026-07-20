type AnnotationBoundary = {
  start: number;
  end: number;
};

export function resizeAnnotationBoundary<T extends AnnotationBoundary>(
  annotations: T[],
  annotationIndex: number,
  edge: "start" | "end",
  requestedTime: number,
  duration: number,
  minimumDuration: number,
) {
  const annotation = annotations[annotationIndex];
  if (!annotation) return annotations;

  const updatedAnnotations = [...annotations];

  if (edge === "start") {
    let start = clamp(
      requestedTime,
      0,
      annotation.end - minimumDuration,
    );
    const previous = annotations[annotationIndex - 1];

    if (previous && start < previous.end) {
      start = Math.max(start, previous.start + minimumDuration);
      updatedAnnotations[annotationIndex - 1] = {
        ...previous,
        end: start,
      };
    }

    updatedAnnotations[annotationIndex] = {
      ...annotation,
      start,
    };
    return updatedAnnotations;
  }

  let end = clamp(
    requestedTime,
    annotation.start + minimumDuration,
    duration,
  );
  const next = annotations[annotationIndex + 1];

  if (next && end > next.start) {
    end = Math.min(end, next.end - minimumDuration);
    updatedAnnotations[annotationIndex + 1] = {
      ...next,
      start: end,
    };
  }

  updatedAnnotations[annotationIndex] = {
    ...annotation,
    end,
  };
  return updatedAnnotations;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
