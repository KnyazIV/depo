-- Защита от двойной брони на уровне базы.
--
-- Проверка «свободно ли это время» в коде приложения ничего не гарантирует:
-- serverless-функции Vercel выполняются параллельно, и между SELECT и INSERT
-- успевает вклиниться другой запрос. Единственный надёжный арбитр — сама база,
-- поэтому пересечение броней запрещено constraint'ом, а код лишь переводит
-- ошибку 23P01 в понятный ответ 409.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- resource_id и unit_id сравниваются на равенство — это умеет btree_gist,
-- blocked_period на пересечение — это умеет gist. Предикат сужает constraint
-- до статусов, которые реально удерживают слот: отклонённые, отменённые и
-- просроченные заявки освобождают время автоматически, без удаления строк.
--
-- unit_id объявлен NOT NULL намеренно: при NULL сравнение `unit_id WITH =`
-- давало бы UNKNOWN вместо TRUE, и для бани с квестом constraint просто не
-- срабатывал бы. Поэтому у каждого ресурса есть хотя бы одна единица.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "resource_id" WITH =,
    "unit_id" WITH =,
    "blocked_period" WITH &&
  ) WHERE (status IN ('pending', 'confirmed'));
--> statement-breakpoint

-- Выборка занятости на конкретную дату идёт по пересечению с суточным диапазоном.
CREATE INDEX "bookings_blocked_period_idx" ON "bookings" USING gist ("blocked_period");
--> statement-breakpoint

CREATE INDEX "resource_closures_period_idx" ON "resource_closures" USING gist ("period");
--> statement-breakpoint

-- Инварианты диапазонов: бронь не бывает пустой, а буфер только расширяет её.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_period_not_empty" CHECK (NOT isempty("period"));
--> statement-breakpoint

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_blocked_contains_period" CHECK ("blocked_period" @> "period");
