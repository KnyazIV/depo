import { and, eq, notInArray } from "drizzle-orm";

import { connect, schema, withRetry } from "./_db";

/**
 * Наполнение справочников.
 *
 * Все настройки ресурсов живут здесь, а не в коде: цену, часы работы, буферы и
 * количество мест меняют правкой этого файла и повторным запуском `pnpm db:seed`.
 * Скрипт идемпотентен — гоняйте сколько угодно раз.
 */

/** Минуты от полуночи. Значение больше 1440 означает время следующих суток. */
const at = (hours: number, minutes = 0) => hours * 60 + minutes;

/** Цена в копейках. */
const rub = (value: number) => value * 100;

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

type SeedResource = {
  slug: string;
  kind: (typeof schema.resourceKind.enumValues)[number];
  title: string;
  subtitle: string;
  description: string;
  unitNoun: string;
  priceKind: (typeof schema.priceKind.enumValues)[number];
  priceMinor: number;
  slotStepMin: number;
  minDurationMin: number;
  maxDurationMin: number;
  bufferMin: number;
  minGuests: number;
  maxGuests: number;
  asksGuests: boolean;
  sort: number;
  opensMin: number;
  closesMin: number;
  units: { code: string; title: string }[];
};

const TIMEZONE = "Europe/Moscow";
const HORIZON_DAYS = 30;
const MIN_LEAD_MIN = 120;
const HOLD_MIN = 30;

const RESOURCES: SeedResource[] = [
  {
    slug: "coworking",
    kind: "seats",
    title: "Коворкинг",
    subtitle: "12 мест, с 9:00 до 21:00",
    description:
      "Двенадцать мест в бывшем ремонтном цехе: высокие окна, розетка у каждого стола, чайник всегда горячий. Бронируется по часам, так что можно занять место на пару часов между встречами.",
    unitNoun: "место",
    priceKind: "per_hour",
    priceMinor: rub(350),
    slotStepMin: 60,
    minDurationMin: 60,
    maxDurationMin: 720,
    bufferMin: 0,
    minGuests: 1,
    maxGuests: 1,
    asksGuests: false,
    sort: 1,
    opensMin: at(9),
    closesMin: at(21),
    units: [
      { code: "A1", title: "A1 — у окна" },
      { code: "A2", title: "A2 — у окна" },
      { code: "A3", title: "A3 — у окна" },
      { code: "A4", title: "A4 — у окна" },
      { code: "A5", title: "A5 — у окна" },
      { code: "A6", title: "A6 — у окна" },
      { code: "B1", title: "B1 — в тихой зоне" },
      { code: "B2", title: "B2 — в тихой зоне" },
      { code: "B3", title: "B3 — в тихой зоне" },
      { code: "B4", title: "B4 — в тихой зоне" },
      { code: "B5", title: "B5 — в тихой зоне" },
      { code: "B6", title: "B6 — в тихой зоне" },
    ],
  },
  {
    slug: "banya",
    kind: "whole",
    title: "Баня",
    subtitle: "Целиком, от 2 часов, с 10:00 до 02:00",
    description:
      "Финская парная, купель и комната отдыха на компанию до восьми человек. Баня сдаётся целиком и минимум на два часа — за меньшее время она просто не успевает прогреться. После каждой компании полчаса на уборку.",
    unitNoun: "баня",
    priceKind: "per_hour",
    priceMinor: rub(3500),
    slotStepMin: 60,
    minDurationMin: 120,
    maxDurationMin: 360,
    bufferMin: 30,
    minGuests: 2,
    maxGuests: 8,
    asksGuests: true,
    sort: 2,
    opensMin: at(10),
    // 02:00 следующих суток: время закрытия переходит через полночь.
    closesMin: at(26),
    units: [{ code: "main", title: "Баня" }],
  },
  {
    slug: "quest",
    kind: "sessions",
    title: "Квест-комната",
    subtitle: "Сеансы по часу, от 2 до 6 человек",
    description:
      "«Диспетчерская» — час в закрытой комнате, из которой нужно вернуть депо на ход. Ведущий встречает за пятнадцать минут до начала и остаётся на связи всю игру.",
    unitNoun: "комната",
    priceKind: "per_session",
    priceMinor: rub(4500),
    // Сеанс 60 минут плюс 15 минут на сброс комнаты — отсюда шаг сетки 75.
    slotStepMin: 75,
    minDurationMin: 60,
    maxDurationMin: 60,
    bufferMin: 15,
    minGuests: 2,
    maxGuests: 6,
    asksGuests: true,
    sort: 3,
    opensMin: at(12),
    closesMin: at(22),
    units: [{ code: "main", title: "Квест-комната" }],
  },
];

type Buildable = { toSQL(): { sql: string; params: unknown[] } };

async function main() {
  const { db, client } = connect();

  // Драйвер шлёт каждый запрос отдельным round-trip, а справочников много.
  // Собираем операторы через билдер Drizzle и отправляем их пачками.
  const q = (builder: Buildable) => {
    const { sql: text, params } = builder.toSQL();
    return client.query(text, params as unknown[]);
  };

  // 1. Ресурсы.
  const settingsOf = (item: SeedResource) => ({
    kind: item.kind,
    title: item.title,
    subtitle: item.subtitle,
    description: item.description,
    unitNoun: item.unitNoun,
    timezone: TIMEZONE,
    priceKind: item.priceKind,
    priceMinor: item.priceMinor,
    slotStepMin: item.slotStepMin,
    minDurationMin: item.minDurationMin,
    maxDurationMin: item.maxDurationMin,
    bufferMin: item.bufferMin,
    horizonDays: HORIZON_DAYS,
    minLeadMin: MIN_LEAD_MIN,
    holdMin: HOLD_MIN,
    minGuests: item.minGuests,
    maxGuests: item.maxGuests,
    asksGuests: item.asksGuests,
    sort: item.sort,
    isActive: true,
  });

  await withRetry("ресурсы", () =>
    client.transaction([
      ...RESOURCES.map((item) =>
        q(
          db
            .insert(schema.resources)
            .values({ slug: item.slug, ...settingsOf(item) })
            .onConflictDoUpdate({ target: schema.resources.slug, set: settingsOf(item) }),
        ),
      ),
      // Ресурсы, убранные из сида, не удаляем — на них ссылаются прошлые брони.
      q(
        db
          .update(schema.resources)
          .set({ isActive: false })
          .where(
            notInArray(
              schema.resources.slug,
              RESOURCES.map((item) => item.slug),
            ),
          ),
      ),
    ]),
  );

  // 2. Узнаём присвоенные id.
  const rows = await withRetry("чтение id", () =>
    db.select({ id: schema.resources.id, slug: schema.resources.slug }).from(schema.resources),
  );
  const idBySlug = new Map(rows.map((row) => [row.slug, row.id]));

  // 3. Часы работы и единицы — одной пачкой.
  const batch: ReturnType<typeof q>[] = [];

  for (const item of RESOURCES) {
    const resourceId = idBySlug.get(item.slug);
    if (!resourceId) throw new Error(`Ресурс ${item.slug} не создался`);

    // Часы одинаковые все семь дней. Понадобится разное расписание —
    // разверните этот цикл в таблицу «день → часы».
    for (const weekday of WEEKDAYS) {
      batch.push(
        q(
          db
            .insert(schema.resourceHours)
            .values({
              resourceId,
              weekday,
              opensMin: item.opensMin,
              closesMin: item.closesMin,
            })
            .onConflictDoUpdate({
              target: [schema.resourceHours.resourceId, schema.resourceHours.weekday],
              set: { opensMin: item.opensMin, closesMin: item.closesMin },
            }),
        ),
      );
    }

    for (const [index, unit] of item.units.entries()) {
      batch.push(
        q(
          db
            .insert(schema.resourceUnits)
            .values({
              resourceId,
              code: unit.code,
              title: unit.title,
              sort: index,
              isActive: true,
            })
            .onConflictDoUpdate({
              target: [schema.resourceUnits.resourceId, schema.resourceUnits.code],
              set: { title: unit.title, sort: index, isActive: true },
            }),
        ),
      );
    }

    // Единицы, которых больше нет в сиде, только выключаем.
    batch.push(
      q(
        db
          .update(schema.resourceUnits)
          .set({ isActive: false })
          .where(
            and(
              eq(schema.resourceUnits.resourceId, resourceId),
              notInArray(
                schema.resourceUnits.code,
                item.units.map((unit) => unit.code),
              ),
            ),
          ),
      ),
    );
  }

  await withRetry("часы и единицы", () => client.transaction(batch));

  for (const item of RESOURCES) {
    console.log(`  ${item.title}: ${item.units.length} ед., ${item.slug}`);
  }
  console.log("Справочники заполнены.");
}

main().catch((error) => {
  console.error("Seed не прошёл:", error);
  process.exit(1);
});
