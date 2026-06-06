export const spring = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.8,
} as const;

export const easeOut = {
  duration: 0.22,
  ease: [0.16, 1, 0.3, 1],
} as const;

export const defaultClipDurationMs = 3000;
export const minRecordDurationMs = 700;
export const maxRecordDurationMs = 15000;
export const recorderSettleMs = 250;
