export type AnnotationPlaybackMode = "normal" | "loop" | "stop";

export type AnnotationPlaybackBoundary = {
  id: string;
  start: number;
  end: number;
};

export type AnnotationPlaybackBoundaryState = {
  annotationId: string | null;
  playbackEpoch: number | null;
  previousTime: number | null;
  canArm: boolean;
  armed: boolean;
};

export type AnnotationPlaybackTransition = {
  state: AnnotationPlaybackBoundaryState;
  action: "none" | "loop" | "stop";
};

export function createAnnotationPlaybackBoundaryState(): AnnotationPlaybackBoundaryState {
  return {
    annotationId: null,
    playbackEpoch: null,
    previousTime: null,
    canArm: false,
    armed: false,
  };
}

export function advanceAnnotationPlayback({
  mode,
  annotation,
  currentTime,
  playbackEpoch,
  playbackStartPosition,
  state,
}: {
  mode: AnnotationPlaybackMode;
  annotation: AnnotationPlaybackBoundary | null;
  currentTime: number;
  playbackEpoch: number;
  playbackStartPosition: number;
  state: AnnotationPlaybackBoundaryState;
}): AnnotationPlaybackTransition {
  const nextTime = Number.isFinite(currentTime) ? currentTime : 0;

  if (mode === "normal" || !annotation) {
    return {
      state: {
        annotationId: annotation?.id ?? null,
        playbackEpoch,
        previousTime: nextTime,
        canArm: false,
        armed: false,
      },
      action: "none",
    };
  }

  const isInside = nextTime >= annotation.start && nextTime < annotation.end;
  const playbackRestarted = state.playbackEpoch !== playbackEpoch;
  const annotationChanged = state.annotationId !== annotation.id;
  const canArmFromPlaybackStart =
    Number.isFinite(playbackStartPosition)
    && playbackStartPosition < annotation.end;

  // play() and seekTo() both establish a new playback epoch in the waveform
  // engine. Starting after an annotation therefore never looks like playback
  // crossing its end.
  if (playbackRestarted || annotationChanged || state.previousTime === null) {
    return {
      state: {
        annotationId: annotation.id,
        playbackEpoch,
        previousTime: nextTime,
        canArm: canArmFromPlaybackStart,
        armed: canArmFromPlaybackStart && isInside,
      },
      action: "none",
    };
  }

  // A backwards jump is another discontinuity. The next forward pass can arm
  // again if the playhead is now inside the annotation.
  if (nextTime < state.previousTime) {
    return {
      state: {
        annotationId: annotation.id,
        playbackEpoch,
        previousTime: nextTime,
        canArm: state.canArm,
        armed: state.canArm && isInside,
      },
      action: "none",
    };
  }

  if (
    state.armed
    && state.previousTime < annotation.end
    && nextTime >= annotation.end
  ) {
    return {
      state: {
        annotationId: annotation.id,
        playbackEpoch,
        previousTime: annotation.end,
        canArm: false,
        armed: false,
      },
      action: mode,
    };
  }

  return {
    state: {
      annotationId: annotation.id,
      playbackEpoch,
      previousTime: nextTime,
      canArm: state.canArm,
      armed: state.armed || (state.canArm && isInside),
    },
    action: "none",
  };
}
