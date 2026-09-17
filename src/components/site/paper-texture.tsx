/**
 * Фактура бумаги — волны, затухающие к правому нижнему углу.
 *
 * Отдельный закреплённый слой, а не фон body: фон нельзя маскировать, не
 * задев вместе с ним и содержимое. Слой лежит под контентом и не ловит мышь,
 * так что на поведение страницы не влияет.
 */
export function PaperTexture() {
  return <div aria-hidden="true" className="paper-texture pointer-events-none fixed inset-0 z-0" />;
}
