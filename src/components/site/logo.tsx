/**
 * Знак «Д».
 *
 * Не буква из шрифта, а нарисованная монограмма: у Д есть скат и широкое
 * основание на двух ножках — силуэт депо с воротами. Один и тот же контур
 * стоит в шапке и во вкладке браузера (`src/app/icon.svg`).
 */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="5" fill="currentColor" />
      <g fill="var(--paper)">
        <rect x="10.5" y="5.5" width="12.5" height="4.2" />
        <rect x="18.4" y="5.5" width="4.6" height="15" />
        <polygon points="10.5,5.5 15.1,5.5 11.6,20.5 7,20.5" />
        <rect x="4" y="20.5" width="24" height="3.9" />
        <rect x="4.6" y="24.4" width="4.2" height="2.1" />
        <rect x="23.2" y="24.4" width="4.2" height="2.1" />
      </g>
    </svg>
  );
}
