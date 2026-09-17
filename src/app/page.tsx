import { TodayBoard } from "@/components/board/board";
import { SiteFooter } from "@/components/site/chrome";
import { RailTrack } from "@/components/site/rail-track";
import { getBoard } from "@/domain/availability";
import { listResources } from "@/domain/resources";
import { site } from "@/lib/site";
import { isDateKey } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { date } = await searchParams;
  const requested = typeof date === "string" && isDateKey(date) ? date : undefined;

  const resources = await listResources();
  const board = await getBoard(resources, requested);

  return (
    <>
      <main className="mx-auto max-w-3xl px-4">
        <section className="pt-12 pb-8 sm:pt-20">
          <h1 className="font-display text-[clamp(3.5rem,17vw,7rem)] leading-[0.85]">ДЕПО</h1>
          <p className="text-ink-soft mt-5 max-w-[32ch] text-lg leading-relaxed">
            Коворкинг, баня и квест-комната в бывшем трамвайном депо. Всё бронируется по часам.
          </p>
        </section>

        <RailTrack />

        <TodayBoard board={board} />

        <section className="max-w-[52ch] space-y-4 py-10 leading-relaxed">
          <p>
            Выберите время и оставьте заявку — она удержит слот на полчаса. За это время
            администратор подтвердит бронь и перезвонит. Если не подтвердит, время снова станет
            свободным, и платить ни за что не придётся.
          </p>
          <p className="text-ink-soft">
            Что-то не помещается в форму — звоните:{" "}
            <a
              href={`tel:${site.phone.replace(/[^\d+]/g, "")}`}
              className="tnum text-ink decoration-line hover:decoration-ink whitespace-nowrap underline underline-offset-4"
            >
              {site.phone}
            </a>
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
