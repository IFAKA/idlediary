"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Clapperboard,
  LoaderCircle,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ResponsiveConfirm } from "@/components/responsive-confirm";
import { Button } from "@/components/ui/button";
import {
  getObjectUrlForClip,
  getThumbnailObjectUrlForClip,
} from "@/features/clips/media-cache";
import type { ClipRecord } from "@/features/clips/types";
import { clipMoodDescriptionFromAnalysis } from "@/features/music/clip-analysis";
import { useHistoryOverlay } from "@/hooks/use-history-overlay";
import { spring } from "@/lib/motion";

const deleteZoneId = "clip-review-delete-zone";

type ClipReviewPanelProps = {
  clips: ClipRecord[];
  isFinishing: boolean;
  onBack: () => void;
  onClearDraft: () => Promise<boolean>;
  onDeleteClip: (id: string) => Promise<boolean>;
  onMakeVideo: (clips: ClipRecord[]) => void;
  onReorderClips: (clipIds: string[]) => Promise<boolean>;
};

export function ClipReviewPanel({
  clips,
  isFinishing,
  onBack,
  onClearDraft,
  onDeleteClip,
  onMakeVideo,
  onReorderClips,
}: ClipReviewPanelProps) {
  const [orderedClips, setOrderedClips] = useState(clips);
  const [deleteTarget, setDeleteTarget] = useState<ClipRecord | null>(null);
  const [confirmClearDraft, setConfirmClearDraft] = useState(false);
  const [previewClip, setPreviewClip] = useState<ClipRecord | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [isOverDeleteZone, setIsOverDeleteZone] = useState(false);
  const hasVibratedForDeleteZone = useRef(false);
  const orderedClipsRef = useRef(orderedClips);
  const visibleClips = orderedClips.slice(0, 20);
  const processingClipCount = visibleClips.filter(
    (clip) => !clipMoodDescriptionFromAnalysis(clip),
  ).length;
  const activeClip =
    visibleClips.find((clip) => clip.id === activeClipId) ?? null;
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 260,
        tolerance: 8,
      },
    }),
  );

  useEffect(() => {
    orderedClipsRef.current = orderedClips;
  }, [orderedClips]);

  useEffect(() => {
    setOrderedClips((current) => {
      const incomingById = new Map(clips.map((clip) => [clip.id, clip]));
      const kept = current
        .map((clip) => incomingById.get(clip.id))
        .filter((clip): clip is ClipRecord => Boolean(clip));
      const knownIds = new Set(kept.map((clip) => clip.id));
      const appended = clips.filter((clip) => !knownIds.has(clip.id));
      const next = [...kept, ...appended];
      orderedClipsRef.current = next;
      return next;
    });
  }, [clips]);

  useEffect(() => {
    if (!isOverDeleteZone || hasVibratedForDeleteZone.current) return;
    navigator.vibrate?.(12);
    hasVibratedForDeleteZone.current = true;
  }, [isOverDeleteZone]);

  const saveOrder = async () => {
    const currentOrder = orderedClipsRef.current;
    const hasCurrentOrderChanged =
      currentOrder.map((clip) => clip.id).join("|") !==
      clips.map((clip) => clip.id).join("|");
    if (!hasCurrentOrderChanged) return true;
    return onReorderClips(currentOrder.map((clip) => clip.id));
  };

  const moveClip = useCallback(
    (activeId: string, overId: string) => {
      if (activeId === overId) return;

      const current = orderedClipsRef.current;
      const fromIndex = current.findIndex((clip) => clip.id === activeId);
      const toIndex = current.findIndex((clip) => clip.id === overId);
      if (fromIndex < 0 || toIndex < 0) return;

      const next = arrayMove(current, fromIndex, toIndex);
      setOrderedClips(next);
      orderedClipsRef.current = next;
      void onReorderClips(next.map((clip) => clip.id)).then((saved) => {
        if (saved) return;
        setOrderedClips(current);
        orderedClipsRef.current = current;
      });
    },
    [onReorderClips],
  );

  useEffect(() => {
    if (!activeClipId) return;

    const draggedClipId = activeClipId;
    const finishMissedDrop = (event: MouseEvent | PointerEvent | TouchEvent) => {
      const point =
        "changedTouches" in event
          ? event.changedTouches[0]
          : "clientX" in event
            ? event
            : null;
      if (!point) return;

      window.setTimeout(() => {
        setActiveClipId((currentActiveClipId) => {
          if (currentActiveClipId !== draggedClipId) return currentActiveClipId;

          const dropTarget = document.elementFromPoint(point.clientX, point.clientY);
          const overClipId = dropTarget
            ?.closest<HTMLElement>("[data-clip-id]")
            ?.dataset.clipId;
          const isOverDelete = Boolean(
            dropTarget?.closest(`[data-droppable-id="${deleteZoneId}"]`),
          );
          const draggedClip = orderedClipsRef.current.find(
            (clip) => clip.id === draggedClipId,
          );

          if (isOverDelete && draggedClip) {
            setDeleteTarget(draggedClip);
          } else if (overClipId) {
            moveClip(draggedClipId, overClipId);
          }

          setIsOverDeleteZone(false);
          hasVibratedForDeleteZone.current = false;
          return null;
        });
      }, 0);
    };

    window.addEventListener("mouseup", finishMissedDrop, true);
    window.addEventListener("pointerup", finishMissedDrop, true);
    window.addEventListener("touchend", finishMissedDrop, true);

    return () => {
      window.removeEventListener("mouseup", finishMissedDrop, true);
      window.removeEventListener("pointerup", finishMissedDrop, true);
      window.removeEventListener("touchend", finishMissedDrop, true);
    };
  }, [activeClipId, moveClip]);

  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    const deleteCollision = pointerCollisions.find(
      (collision) => collision.id === deleteZoneId,
    );
    if (deleteCollision) return [deleteCollision];
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => container.id !== deleteZoneId,
      ),
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveClipId(String(event.active.id));
    setIsOverDeleteZone(false);
    hasVibratedForDeleteZone.current = false;
  };

  const handleDragOver = (event: DragOverEvent) => {
    setIsOverDeleteZone(event.over?.id === deleteZoneId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const draggedClip = orderedClipsRef.current.find(
      (clip) => clip.id === event.active.id,
    );
    const overId = event.over?.id;

    setActiveClipId(null);
    setIsOverDeleteZone(false);
    hasVibratedForDeleteZone.current = false;

    if (!draggedClip || !overId) return;

    if (overId === deleteZoneId) {
      setDeleteTarget(draggedClip);
      return;
    }

    if (event.active.id === overId) return;

    moveClip(String(event.active.id), String(overId));
  };

  const handleDragCancel = () => {
    setActiveClipId(null);
    setIsOverDeleteZone(false);
    hasVibratedForDeleteZone.current = false;
  };

  const makeVideo = async () => {
    const saved = await saveOrder();
    if (!saved) return;
    onMakeVideo(visibleClips);
  };

  const closePreview = useHistoryOverlay({
    isOpen: previewClip !== null,
    name: "clip-preview",
    onClose: () => setPreviewClip(null),
  });

  if (visibleClips.length === 0) {
    return (
      <motion.div
        className="relative z-10 flex h-[100svh] flex-col top-level-screen"
        layoutId="draft-card"
        transition={spring}
      >
        <EmptyDraft onBack={onBack} />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="relative z-10 flex h-[100svh] flex-col top-level-screen"
      layoutId="draft-card"
      transition={spring}
    >
      <DndContext
        collisionDetection={collisionDetection}
        sensors={sensors}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <SortableContext
            items={visibleClips.map((clip) => clip.id)}
            strategy={rectSortingStrategy}
          >
            <ul className="grid grid-cols-3 gap-2.5 pb-3">
              {visibleClips.map((clip, index) => (
                <SortableClipGalleryItem
                  key={clip.id}
                  clip={clip}
                  index={index}
                  isDisabled={isFinishing}
                  isDraggingToDelete={
                    activeClipId === clip.id && isOverDeleteZone
                  }
                  isProcessing={!clipMoodDescriptionFromAnalysis(clip)}
                  onPreview={() => setPreviewClip(clip)}
                />
              ))}
            </ul>
          </SortableContext>
        </div>

        <ReviewActionBar
          clipCount={visibleClips.length}
          isDeleting={isOverDeleteZone}
          isDragging={Boolean(activeClipId)}
          isFinishing={isFinishing}
          processingClipCount={processingClipCount}
          onClearDraft={() => setConfirmClearDraft(true)}
          onMakeVideo={makeVideo}
        />

        <DragOverlay dropAnimation={null}>
          {activeClip ? (
            <div className="pointer-events-none">
              <ClipPreview
                clip={activeClip}
                index={visibleClips.findIndex(
                  (clip) => clip.id === activeClip.id,
                )}
                isOverlay
                isPulledToDelete={isOverDeleteZone}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ResponsiveConfirm
        actionLabel="Delete clip"
        actionVariant="destructive"
        description="This removes the clip from today's draft. The remaining clips stay in their current order."
        open={Boolean(deleteTarget)}
        title="Delete this clip?"
        onAction={async () => {
          if (!deleteTarget) return;
          const previousClips = orderedClips;
          const nextClips = orderedClips.filter(
            (clip) => clip.id !== deleteTarget.id,
          );
          setOrderedClips(nextClips);
          orderedClipsRef.current = nextClips;
          const deleted = await onDeleteClip(deleteTarget.id);
          if (!deleted) {
            setOrderedClips(previousClips);
            orderedClipsRef.current = previousClips;
            return;
          }
          setDeleteTarget(null);
        }}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />

      <ResponsiveConfirm
        actionLabel="Clear draft"
        actionVariant="destructive"
        description="This deletes every clip in today's draft."
        open={confirmClearDraft}
        title="Clear this draft?"
        onAction={async () => {
          const previousClips = orderedClips;
          setOrderedClips([]);
          orderedClipsRef.current = [];
          const cleared = await onClearDraft();
          if (!cleared) {
            setOrderedClips(previousClips);
            orderedClipsRef.current = previousClips;
            return;
          }
          setConfirmClearDraft(false);
        }}
        onOpenChange={setConfirmClearDraft}
      />

      <BodyPortal>
        <AnimatePresence>
          {previewClip ? (
            <FullscreenPreview
              clip={previewClip}
              onClose={closePreview}
            />
          ) : null}
        </AnimatePresence>
      </BodyPortal>
    </motion.div>
  );
}

function EmptyDraft({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-6 inline-flex size-14 items-center justify-center rounded-full border border-memory/35 bg-memory/15 text-memory">
        <Clapperboard className="size-7" />
      </div>
      <h2 className="text-2xl font-semibold">No draft clips yet</h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
        Record a few three-second clips, then come back here to review them.
      </p>
      <Button className="mt-6" type="button" onClick={onBack}>
        <ArrowLeft className="size-4" />
        Back to recording
      </Button>
    </div>
  );
}

type SortableClipGalleryItemProps = {
  clip: ClipRecord;
  index: number;
  isDisabled: boolean;
  isDraggingToDelete: boolean;
  isProcessing: boolean;
  onPreview: () => void;
};

function SortableClipGalleryItem({
  clip,
  index,
  isDisabled,
  isDraggingToDelete,
  isProcessing,
  onPreview,
}: SortableClipGalleryItemProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: clip.id,
    disabled: isDisabled,
  });

  return (
    <motion.li
      ref={setNodeRef}
      className="relative"
      data-clip-id={clip.id}
      layout
      style={{
        opacity: isDragging ? 0.22 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : 1,
      }}
      transition={spring}
    >
      <ClipPreview
        attributes={attributes}
        clip={clip}
        index={index}
        isPulledToDelete={isDraggingToDelete}
        isProcessing={isProcessing}
        listeners={listeners}
        onOpen={onPreview}
      />
    </motion.li>
  );
}

function ClipPreview({
  attributes,
  clip,
  index,
  isOverlay = false,
  isPulledToDelete = false,
  isProcessing = false,
  listeners,
  onOpen = () => undefined,
}: {
  attributes?: ReturnType<typeof useSortable>["attributes"];
  clip: ClipRecord;
  index: number;
  isOverlay?: boolean;
  isPulledToDelete?: boolean;
  isProcessing?: boolean;
  listeners?: ReturnType<typeof useSortable>["listeners"];
  onOpen?: () => void;
}) {
  const thumbnailSrc = useMemo(() => getThumbnailObjectUrlForClip(clip), [clip]);
  const src = useMemo(
    () => (thumbnailSrc ? null : getObjectUrlForClip(clip)),
    [clip, thumbnailSrc],
  );
  const [canPlay, setCanPlay] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <motion.div
      animate={{
        scale: isPulledToDelete ? 0.9 : isOverlay ? 1.05 : 1,
        y: isPulledToDelete ? 8 : 0,
      }}
      className={`relative aspect-square overflow-hidden rounded-lg border bg-surface-soft shadow-lg ${
        isOverlay
          ? "w-[7.25rem] border-memory/80 shadow-2xl"
          : "w-full border-memory/20"
      }`}
      layoutId={isOverlay ? undefined : `clip-preview-${clip.id}`}
      transition={spring}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Preview clip ${index + 1}`}
        className="absolute inset-0 cursor-grab touch-none overflow-hidden outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        disabled={isOverlay}
        draggable={false}
        type="button"
        onDragStart={(event) => event.preventDefault()}
        onClick={onOpen}
      >
        {thumbnailSrc ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            draggable={false}
            loading="lazy"
            src={thumbnailSrc}
          />
        ) : (
          <video
            aria-hidden="true"
            className="h-full w-full object-cover"
            draggable={false}
            muted
            playsInline
            preload={isOverlay ? "none" : "metadata"}
            src={src ?? undefined}
            onCanPlay={() => setCanPlay(true)}
            onError={() => setHasError(true)}
          />
        )}
      </button>
      {hasError ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/42 text-white"
          data-testid="clip-video-placeholder"
        >
          <span className="relative inline-flex size-10 items-center justify-center rounded-full border border-white/25 bg-black/44 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
            <Clapperboard className="size-5 text-memory" />
            <Play className="absolute -right-1 -bottom-1 size-4 rounded-full bg-white/90 p-0.5 text-black" />
          </span>
        </span>
      ) : null}
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/72 px-2 py-1 text-xs font-semibold text-white">
        {index + 1}
      </span>
      <Play
        className={`pointer-events-none absolute bottom-2 left-2 size-7 rounded-full bg-black/60 p-1.5 text-white ${
          canPlay || thumbnailSrc ? "opacity-100" : "opacity-60"
        }`}
      />
      {isProcessing ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/38 text-white backdrop-blur-[1px]">
          <span className="grid size-10 place-items-center rounded-full border border-white/25 bg-black/58 shadow-[0_8px_24px_rgba(0,0,0,0.24)]">
            <LoaderCircle className="size-5 animate-spin" />
            <span className="sr-only">Analyzing clip</span>
          </span>
        </span>
      ) : null}
    </motion.div>
  );
}

function ReviewActionBar({
  clipCount,
  isDeleting,
  isDragging,
  isFinishing,
  processingClipCount,
  onClearDraft,
  onMakeVideo,
}: {
  clipCount: number;
  isDeleting: boolean;
  isDragging: boolean;
  isFinishing: boolean;
  processingClipCount: number;
  onClearDraft: () => void;
  onMakeVideo: () => void;
}) {
  const { setNodeRef } = useDroppable({
    id: deleteZoneId,
    disabled: !isDragging || isFinishing,
  });

  return (
    <motion.div
      ref={setNodeRef}
      data-droppable-id={deleteZoneId}
      data-testid="review-action-bar"
      className={`mt-3 ${
        isDragging
          ? "rounded-lg border border-destructive/65 bg-destructive/20 p-2.5"
          : ""
      }`}
      animate={{
        scale: isDeleting ? 1.025 : 1,
      }}
      transition={spring}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDragging ? (
          <motion.div
            key="delete-zone"
            className={`flex min-h-14 items-center justify-center gap-3 rounded-md border border-dashed px-4 text-sm font-semibold ${
              isDeleting
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-destructive/55 text-destructive"
            }`}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            initial={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <Trash2 className="size-5" />
            Drop to delete
          </motion.div>
        ) : (
          <motion.div
            key="actions"
            className="grid gap-2"
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {processingClipCount > 0 ? (
              <p className="rounded-lg border border-memory/24 bg-memory/12 px-3 py-2 text-center text-xs font-semibold leading-5 text-memory">
                Getting {processingClipCount === 1 ? "this clip" : "these clips"} ready.
                Make video will unlock automatically.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button
                aria-label="Clear draft"
                disabled={isFinishing || clipCount === 0}
                type="button"
                variant="outline"
                onClick={onClearDraft}
              >
                <RotateCcw className="size-4" />
                Clear draft
              </Button>
              <Button
                aria-busy={processingClipCount > 0}
                disabled={isFinishing || clipCount === 0 || processingClipCount > 0}
                type="button"
                onClick={onMakeVideo}
              >
                {processingClipCount > 0 ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Make video
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FullscreenPreview({
  clip,
  onClose,
}: {
  clip: ClipRecord;
  onClose: () => void;
}) {
  const src = useMemo(() => getObjectUrlForClip(clip), [clip]);
  const [hasError, setHasError] = useState(false);

  useBodyScrollLock();

  return (
    <motion.div
      className="fixed inset-0 z-[100] h-[100svh] overflow-hidden bg-black"
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
    >
      <motion.div
        className="grid h-full w-full place-items-center overflow-hidden bg-black"
        layoutId={`clip-preview-${clip.id}`}
        transition={spring}
      >
        <div className="relative aspect-[9/16] h-full max-h-full max-w-full overflow-hidden bg-black">
          <video
            aria-label="Fullscreen clip preview"
            autoPlay
            className="h-full w-full object-contain"
            controls
            playsInline
            preload="auto"
            src={src ?? undefined}
            onError={() => setHasError(true)}
          />
          {hasError ? (
            <div className="absolute inset-x-4 bottom-4 bg-black/80 p-3 text-sm text-white">
              This clip can&apos;t be loaded by this browser. Record the next clip
              using the current recorder format.
            </div>
          ) : null}
          <button
            aria-label="Close fullscreen preview"
            className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-full border border-white/25 bg-black/55 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            type="button"
            onClick={onClose}
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function useBodyScrollLock() {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
}

function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;

  return createPortal(children, document.body);
}
