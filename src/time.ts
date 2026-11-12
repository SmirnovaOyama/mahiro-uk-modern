const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** The fractional hour of the day right now, on a clock at the given UTC offset. */
export const hourNowAt = (utcOffsetHours: number, now: Date = new Date()): number =>
    mod(now.getTime() / 3_600_000 + utcOffsetHours, 24);

/** 14.5 → "14:30". Always 24-hour, wrapping past midnight. */
export function formatHour(hour: number): string {
    const minutes = Math.floor(mod(hour, 24) * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The short weekday on a clock at the given UTC offset. */
export function weekdayAt(utcOffsetHours: number, locale: string, now: Date = new Date()): string {
    const shifted = new Date(now.getTime() + utcOffsetHours * 3_600_000);
    return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(shifted);
}
