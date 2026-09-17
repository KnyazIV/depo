"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { allowedDurations } from "@/domain/slots";
import type { AvailabilityResponse, DayAvailability, ResourceConfig } from "@/domain/types";
import { type DateKey, formatDuration, shiftDateKey, utcToDateKey } from "@/lib/time";

import { BookingForm } from "./booking-form";
import { DateRibbon } from "./date-ribbon";
import { SlotGrid } from "./slot-grid";

/**
 * Выбор времени и заявка.
 *
 * Расписание перечитывается при возврате на вкладку и сразу после отказа 409 —
 * человек не должен смотреть на устаревшую сетку. Считает доступность тот же
 * код, что и сервер (`domain/slots`), поэтому картинка и ответ API совпадают.
 */
export function BookingPanel({
  resource,
  initial,
}: {
  resource: ResourceConfig;
  initial: DayAvailability;
}) {
  const [day, setDay] = useState(initial);
  const [date, setDate] = useState<DateKey>(initial.date);
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState<string | null>(null);
  const [duration, setDuration] = useState(resource.minDurationMin);
  const [unitId, setUnitId] = useState<number | null>(null);

  // Выбранное время дублируем в ref, чтобы обновление расписания могло сравнить
  // его с новыми данными, не пересоздавая обработчики на каждый выбор слота.
  const chosenRef = useRef<string | null>(null);
  useEffect(() => {
    chosenRef.current = start;
  }, [start]);

  const load = useCallback(
    async (target: DateKey) => {
      setLoading(true);
      try {
        const response = await fetch(`/api/availability?slug=${resource.slug}&date=${target}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(String(response.status));

        const payload: AvailabilityResponse = await response.json();
        setDay(payload.availability);

        const chosen = chosenRef.current;
        const stillFree = payload.availability.slots.some(
          (item) => item.start === chosen && item.state === "free",
        );

        if (chosen && !stillFree) {
          setStart(null);
          setUnitId(null);
          toast.error("Это время успели занять. Выберите другое");
        }
      } catch {
        toast.error("Не удалось обновить расписание");
      } finally {
        setLoading(false);
      }
    },
    [resource.slug],
  );

  function pickDate(next: DateKey) {
    setDate(next);
    setStart(null);
    setUnitId(null);
    void load(next);
  }

  // Возврат на вкладку: за время отсутствия слоты могли разобрать.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load(date);
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [date, load]);

  const dates = useMemo(() => {
    const today = utcToDateKey(new Date(day.now), resource.timezone);
    return Array.from({ length: resource.horizonDays + 1 }, (_, index) =>
      shiftDateKey(today, index),
    );
  }, [day.now, resource.horizonDays, resource.timezone]);

  // Слот считаем выбранным, только пока он свободен: если время увели между
  // рендерами, форма исчезнет сама, без синхронизации состояний в эффекте.
  const selected = start ? day.slots.find((item) => item.start === start) : undefined;
  const slot = selected?.state === "free" ? selected : null;

  const unitsForSlot = useMemo(() => {
    if (!slot) return [];
    return slot.units.flatMap((free) => {
      const unit = day.units.find((item) => item.id === free.id);
      return unit ? [{ ...unit, maxDurationMin: free.maxDurationMin }] : [];
    });
  }, [slot, day.units]);

  const cap = unitId
    ? (unitsForSlot.find((unit) => unit.id === unitId)?.maxDurationMin ?? 0)
    : (slot?.maxDurationMin ?? 0);

  const durations = allowedDurations(resource, cap);
  const effectiveDuration = durations.includes(duration)
    ? duration
    : (durations.at(-1) ?? resource.minDurationMin);

  const seats = unitsForSlot.filter((unit) => unit.maxDurationMin >= effectiveDuration);

  return (
    <div className="space-y-9">
      <section className="space-y-3">
        <SectionTitle>Выберите день</SectionTitle>
        <DateRibbon dates={dates} value={date} timezone={resource.timezone} onChange={pickDate} />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <SectionTitle>Начало</SectionTitle>
          {day.hoursLabel && (
            <span className="tnum text-ink-soft text-sm">работаем {day.hoursLabel}</span>
          )}
        </div>

        {!day.isOpen ? (
          <Notice>В этот день {resource.title.toLowerCase()} закрыт.</Notice>
        ) : day.slots.every((item) => item.state !== "free") ? (
          <>
            <SlotGrid
              slots={day.slots}
              value={slot?.start ?? null}
              busy={loading}
              onChange={setStart}
            />
            <Notice>Свободного времени в этот день не осталось. Посмотрите соседние дни.</Notice>
          </>
        ) : (
          <SlotGrid
            slots={day.slots}
            value={slot?.start ?? null}
            busy={loading}
            onChange={setStart}
          />
        )}
      </section>

      {slot && durations.length > 1 && (
        <section className="space-y-3">
          <SectionTitle>Сколько времени</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {durations.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDuration(option)}
                aria-pressed={option === effectiveDuration}
                className={`tnum rounded-sm border px-4 py-3 font-medium transition-colors ${
                  option === effectiveDuration
                    ? "border-res bg-res text-white"
                    : "border-line-strong bg-card hover:border-res"
                }`}
              >
                {formatDuration(option)}
              </button>
            ))}
          </div>
        </section>
      )}

      {slot && resource.kind === "seats" && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <SectionTitle>Место</SectionTitle>
            <span className="text-ink-soft text-sm">
              свободно {seats.length} из {day.units.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <SeatButton selected={unitId === null} onClick={() => setUnitId(null)}>
              Любое свободное
            </SeatButton>
            {seats.map((unit) => (
              <SeatButton
                key={unit.id}
                selected={unitId === unit.id}
                onClick={() => setUnitId(unit.id)}
              >
                {unit.code}
              </SeatButton>
            ))}
          </div>
        </section>
      )}

      {slot ? (
        <section className="space-y-3">
          <SectionTitle>Ваши контакты</SectionTitle>
          <BookingForm
            resource={resource}
            draft={{
              start: slot.start,
              durationMin: effectiveDuration,
              unitId,
              unitTitle:
                resource.kind === "seats"
                  ? (seats.find((unit) => unit.id === unitId)?.title ?? "Любое свободное")
                  : null,
            }}
            onSlotTaken={() => {
              setStart(null);
              setUnitId(null);
              void load(date);
            }}
          />
        </section>
      ) : (
        <Notice>Выберите время — форма появится сразу под сеткой.</Notice>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-base">{children}</h2>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="border-line bg-panel text-ink-soft border px-4 py-3 text-sm">{children}</p>;
}

function SeatButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`tnum min-w-14 rounded-sm border px-3 py-3 text-sm font-medium transition-colors ${
        selected ? "border-res bg-res text-white" : "border-line-strong bg-card hover:border-res"
      }`}
    >
      {children}
    </button>
  );
}
