import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db, retryTransient } from "@/db/client";
import { resourceHours, resourceUnits, resources } from "@/db/schema";

import type { ResourceConfig, UnitView } from "./types";

/** Чтение справочников. Настройки ресурсов живут в базе, а не в коде. */

type ResourceRow = typeof resources.$inferSelect;

export function toResourceConfig(row: ResourceRow): ResourceConfig {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    unitNoun: row.unitNoun,
    timezone: row.timezone,
    priceKind: row.priceKind,
    priceMinor: row.priceMinor,
    slotStepMin: row.slotStepMin,
    minDurationMin: row.minDurationMin,
    maxDurationMin: row.maxDurationMin,
    bufferMin: row.bufferMin,
    horizonDays: row.horizonDays,
    minLeadMin: row.minLeadMin,
    holdMin: row.holdMin,
    minGuests: row.minGuests,
    maxGuests: row.maxGuests,
    asksGuests: row.asksGuests,
  };
}

export async function listResources(): Promise<ResourceConfig[]> {
  const rows = await retryTransient(() =>
    db().select().from(resources).where(eq(resources.isActive, true)).orderBy(asc(resources.sort)),
  );

  return rows.map(toResourceConfig);
}

export async function getResourceBySlug(slug: string): Promise<ResourceConfig | null> {
  const [row] = await retryTransient(() =>
    db()
      .select()
      .from(resources)
      .where(and(eq(resources.slug, slug), eq(resources.isActive, true)))
      .limit(1),
  );

  return row ? toResourceConfig(row) : null;
}

export async function listUnits(resourceId: number): Promise<UnitView[]> {
  return retryTransient(() =>
    db()
      .select({
        id: resourceUnits.id,
        code: resourceUnits.code,
        title: resourceUnits.title,
      })
      .from(resourceUnits)
      .where(and(eq(resourceUnits.resourceId, resourceId), eq(resourceUnits.isActive, true)))
      .orderBy(asc(resourceUnits.sort), asc(resourceUnits.id)),
  );
}

export type WorkingHoursRow = { opensMin: number; closesMin: number };

/** Часы работы на конкретный день недели. null — выходной. */
export async function getHours(
  resourceId: number,
  weekday: number,
): Promise<WorkingHoursRow | null> {
  const [row] = await retryTransient(() =>
    db()
      .select({ opensMin: resourceHours.opensMin, closesMin: resourceHours.closesMin })
      .from(resourceHours)
      .where(and(eq(resourceHours.resourceId, resourceId), eq(resourceHours.weekday, weekday)))
      .limit(1),
  );

  return row ?? null;
}

/**
 * Часы работы сразу на несколько дней недели.
 *
 * Бронь бани может относиться к сегодняшнему или ко вчерашнему операционному
 * дню, и спрашивать базу дважды ради этого незачем — в serverless каждый
 * лишний round-trip заметен.
 */
export async function getHoursFor(
  resourceId: number,
  weekdays: number[],
): Promise<Map<number, WorkingHoursRow>> {
  const rows = await retryTransient(() =>
    db()
      .select({
        weekday: resourceHours.weekday,
        opensMin: resourceHours.opensMin,
        closesMin: resourceHours.closesMin,
      })
      .from(resourceHours)
      .where(
        and(eq(resourceHours.resourceId, resourceId), inArray(resourceHours.weekday, weekdays)),
      ),
  );

  return new Map(
    rows.map((row) => [row.weekday, { opensMin: row.opensMin, closesMin: row.closesMin }]),
  );
}
