"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { computePrice, formatPrice } from "@/domain/pricing";
import type { ResourceConfig } from "@/domain/types";
import { formatDateTime, formatDuration, formatTime } from "@/lib/time";
import { formatPhoneMask } from "@/lib/validation/booking";

/**
 * Форма заявки.
 *
 * Перед отправкой человек видит итог: что, когда, сколько длится и сколько
 * стоит. Ошибки полей приходят с сервера в том же формате, что и локальные,
 * поэтому обрабатываются одинаково.
 */

export type BookingDraft = {
  start: string;
  durationMin: number;
  unitId: number | null;
  unitTitle: string | null;
};

const FIELD_CLASS = "h-12 rounded-sm border-line-strong bg-card text-base";

export function BookingForm({
  resource,
  draft,
  onSlotTaken,
}: {
  resource: ResourceConfig;
  draft: BookingDraft;
  onSlotTaken: () => void;
}) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+7 ");
  const [email, setEmail] = useState("");
  const [guests, setGuests] = useState(resource.minGuests);
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const start = new Date(draft.start);
  const end = new Date(start.getTime() + draft.durationMin * 60_000);
  const price = computePrice(resource, draft.durationMin);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setErrors({});

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: resource.slug,
          start: draft.start,
          durationMin: draft.durationMin,
          unitId: draft.unitId,
          name,
          phone,
          email,
          guests,
          comment,
          consent,
          website,
        }),
      });

      const payload = await response.json();

      if (response.ok) {
        router.push(`/zayavka/${payload.code}`);
        return;
      }

      if (response.status === 409) {
        // Время увели, пока человек заполнял форму. Сразу перерисовываем сетку.
        toast.error(payload.message);
        onSlotTaken();
        return;
      }

      if (payload.fields) setErrors(payload.fields);
      toast.error(payload.message ?? "Не получилось отправить заявку");
    } catch {
      toast.error("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div className="border-line bg-panel border p-4">
        <dl className="space-y-1.5 text-sm">
          <Row label={resource.title}>
            {formatDateTime(start, resource.timezone)} – {formatTime(end, resource.timezone)}
          </Row>
          <Row label="Длительность">{formatDuration(draft.durationMin)}</Row>
          {draft.unitTitle && <Row label="Место">{draft.unitTitle}</Row>}
          {resource.asksGuests && <Row label="Гостей">{guests}</Row>}
        </dl>
        <p className="border-line mt-3 flex items-baseline justify-between border-t pt-3">
          <span className="text-ink-soft text-sm">К оплате на месте</span>
          <span className="tnum font-display text-2xl">{formatPrice(price)}</span>
        </p>
      </div>

      <Field id="name" label="Как к вам обращаться" error={errors.name}>
        <Input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          className={FIELD_CLASS}
          aria-invalid={Boolean(errors.name)}
        />
      </Field>

      <Field id="phone" label="Телефон" error={errors.phone}>
        <Input
          id="phone"
          value={phone}
          onChange={(event) => setPhone(formatPhoneMask(event.target.value))}
          inputMode="tel"
          autoComplete="tel"
          className={`${FIELD_CLASS} tnum`}
          aria-invalid={Boolean(errors.phone)}
        />
      </Field>

      <Field id="email" label="Почта, если нужно подтверждение письмом" error={errors.email}>
        <Input
          id="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          inputMode="email"
          autoComplete="email"
          className={FIELD_CLASS}
          aria-invalid={Boolean(errors.email)}
        />
      </Field>

      {resource.asksGuests && (
        <Field id="guests" label="Сколько вас будет" error={errors.guests}>
          <div className="flex items-center gap-3">
            <Stepper
              value={guests}
              min={resource.minGuests}
              max={resource.maxGuests}
              onChange={setGuests}
            />
            <span className="text-ink-soft text-sm">
              от {resource.minGuests} до {resource.maxGuests}
            </span>
          </div>
        </Field>
      )}

      <Field id="comment" label="Что-то важное для администратора" error={errors.comment}>
        <Textarea
          id="comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          className="border-line-strong bg-card min-h-24 rounded-sm text-base"
        />
      </Field>

      {/* Ловушка для ботов: людям она не видна и не доступна с клавиатуры. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Не заполняйте это поле</label>
        <input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id="consent"
            checked={consent}
            onCheckedChange={(checked) => setConsent(checked === true)}
            className="mt-0.5 size-5 rounded-sm"
            aria-invalid={Boolean(errors.consent)}
          />
          <Label htmlFor="consent" className="text-sm leading-relaxed font-normal">
            Согласен на обработку персональных данных по{" "}
            <Link href="/policy" className="underline underline-offset-4" target="_blank">
              политике обработки
            </Link>
          </Label>
        </div>
        {errors.consent && <p className="text-destructive text-sm">{errors.consent}</p>}
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="bg-res hover:bg-res-ink h-14 w-full rounded-sm text-base text-white"
      >
        {pending ? "Отправляем…" : "Отправить заявку"}
      </Button>

      <p className="text-ink-soft text-center text-sm">
        Заявка удержит время на {resource.holdMin} минут, пока администратор её подтверждает
      </p>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tnum text-right font-medium">{children}</dd>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-ink-soft text-sm font-normal">
        {label}
      </Label>
      {children}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const step = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));

  return (
    <div className="border-line-strong bg-card flex items-center border">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={value <= min}
        aria-label="Меньше гостей"
        className="disabled:text-line-strong h-12 w-12 text-xl"
      >
        −
      </button>
      <span className="tnum w-10 text-center text-lg font-medium" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={value >= max}
        aria-label="Больше гостей"
        className="disabled:text-line-strong h-12 w-12 text-xl"
      >
        +
      </button>
    </div>
  );
}
