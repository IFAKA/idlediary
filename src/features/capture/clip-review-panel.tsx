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
import { Play, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveConfirm } from "@/components/responsive-confirm";
import { Button } from "@/components/ui/button";
import { getObjectUrlForClip } from "@/features/clips/media-cache";
import type { ClipRecord } from "@/features/clips/types";
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

    const current = orderedClipsRef.current;
    const fromIndex = current.findIndex((clip) => clip.id === event.active.id);
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
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <SortableContext
            items={visibleClips.map((clip) => clip.id)}
            strategy={rectSortingStrategy}
          >
            <ul className="grid grid-cols-3 gap-2.5 pb-3 sm:grid-cols-4">
              {visibleClips.map((clip, index) => (
                <SortableClipGalleryItem
                  key={clip.id}
                  clip={clip}
                  index={index}
                  isDisabled={isFinishing}
                  isDraggingToDelete={
                    activeClipId === clip.id && isOverDeleteZone
                  }
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
          onClearDraft={() => setConfirmClearDraft(true)}
          onMakeVideo={makeVideo}
        />

        <DragOverlay dropAnimation={null}>
          {activeClip ? (
            <ClipPreview
              clip={activeClip}
              index={visibleClips.findIndex(
                (clip) => clip.id === activeClip.id,
              )}
              isOverlay
              isPulledToDelete={isOverDeleteZone}
            />
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
          if (nextClips.length === 0) {
            onBack();
          }
        }}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />

      <ResponsiveConfirm
        actionLabel="Clear draft"
        actionVariant="destructive"
        description="This deletes every clip in today's draft and returns to the camera."
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
          onBack();
        }}
        onOpenChange={setConfirmClearDraft}
      />

      <AnimatePresence>
        {previewClip ? (
          <FullscreenPreview
            clip={previewClip}
            onClose={closePreview}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

type SortableClipGalleryItemProps = {
  clip: ClipRecord;
  index: number;
  isDisabled: boolean;
  isDraggingToDelete: boolean;
  onPreview: () => void;
};

function SortableClipGalleryItem({
  clip,
  index,
  isDisabled,
  isDraggingToDelete,
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
  listeners,
  onOpen = () => undefined,
}: {
  attributes?: ReturnType<typeof useSortable>["attributes"];
  clip: ClipRecord;
  index: number;
  isOverlay?: boolean;
  isPulledToDelete?: boolean;
  listeners?: ReturnType<typeof useSortable>["listeners"];
  onOpen?: () => void;
}) {
  const src = useMemo(() => getObjectUrlForClip(clip), [clip]);
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
        type="button"
        onClick={onOpen}
      >
        <video
          aria-hidden="true"
          className="h-full w-full object-cover"
          muted
          playsInline
          preload={isOverlay ? "none" : "metadata"}
          src={src ?? undefined}
          onCanPlay={() => setCanPlay(true)}
          onError={() => setHasError(true)}
        />
      </button>
      {hasError ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] font-semibold text-destructive">
          Can&apos;t load
        </span>
      ) : null}
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/72 px-2 py-1 text-xs font-semibold text-white">
        {index + 1}
      </span>
      <Play
        className={`pointer-events-none absolute bottom-2 left-2 size-7 rounded-full bg-black/60 p-1.5 text-white ${
          canPlay ? "opacity-100" : "opacity-60"
        }`}
      />
    </motion.div>
  );
}

function ReviewActionBar({
  clipCount,
  isDeleting,
  isDragging,
  isFinishing,
  onClearDraft,
  onMakeVideo,
}: {
  clipCount: number;
  isDeleting: boolean;
  isDragging: boolean;
  isFinishing: boolean;
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
            className="grid grid-cols-2 gap-2"
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
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
              disabled={isFinishing || clipCount === 0}
              type="button"
              onClick={onMakeVideo}
            >
              <Sparkles className="size-4" />
              Make video
            </Button>
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
  useEscapeClose(onClose);

  return (
    <motion.div
      className="fixed inset-0 z-50 h-[100svh] overflow-hidden bg-black safe-screen"
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
    >
      <motion.div
        className="relative h-full w-full overflow-hidden bg-black"
        layoutId={`clip-preview-${clip.id}`}
        transition={spring}
      >
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
      </motion.div>
    </motion.div>
  );
}

function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
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
