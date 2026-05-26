import type { VlogRecord } from "@/features/clips/types";

export function dateKey(date: Date | string) {
  return new Date(date).toISOString().slice(0, 10);
}

export function generatedDaySet(vlogs: VlogRecord[]) {
  return new Set(vlogs.map((vlog) => dateKey(vlog.createdAt)));
}

export function calculateStreak(vlogs: VlogRecord[], today = new Date()) {
  const days = generatedDaySet(vlogs);
  let streak = 0;
  const cursor = new Date(today);

  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
