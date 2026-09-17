import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BookingPanel } from "@/components/booking/booking-panel";
import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import { getDayAvailability } from "@/domain/availability";
import { formatPriceRate } from "@/domain/pricing";
import { getResourceBySlug } from "@/domain/resources";
import { isDateKey, utcToDateKey } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const resource = await getResourceBySlug(slug);

  if (!resource) return { title: "Страница не найдена" };

  return {
    title: resource.title,
    description: resource.description,
  };
}

export default async function ResourcePage({ params, searchParams }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const resource = await getResourceBySlug(slug);

  if (!resource) notFound();

  const now = new Date();
  const { date } = await searchParams;

  // Дату можно принести с главной — тогда страница открывается сразу на ней.
  const requested =
    typeof date === "string" && isDateKey(date) ? date : utcToDateKey(now, resource.timezone);

  const initial = await getDayAvailability(resource, requested, now);

  return (
    <div data-res={resource.slug}>
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 pb-16">
        <header className="py-9">
          <h1 className="font-display text-[clamp(2.25rem,9vw,3.5rem)] leading-[0.95]">
            {resource.title}
          </h1>
          <p className="text-ink-soft mt-3 text-lg">{resource.subtitle}</p>
          <p className="mt-6 max-w-[54ch] leading-relaxed">{resource.description}</p>
          <p className="tnum font-display text-res-ink mt-6 text-xl">{formatPriceRate(resource)}</p>
        </header>

        <BookingPanel resource={resource} initial={initial} />
      </main>

      <SiteFooter />
    </div>
  );
}
