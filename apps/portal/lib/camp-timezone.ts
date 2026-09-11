function partsFor(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function formatCampDateTime(value: Date | null | undefined, timeZone: string) {
  if (!value) return "";
  const parts = partsFor(value, timeZone);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function parseCampDateTime(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid date and time.");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const target = {
    year: Number(yearText), month: Number(monthText), day: Number(dayText), hour: Number(hourText), minute: Number(minuteText),
  };
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  let guess = targetUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rendered = partsFor(new Date(guess), timeZone);
    const renderedUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute);
    const adjustment = targetUtc - renderedUtc;
    if (adjustment === 0) break;
    guess += adjustment;
  }
  const result = new Date(guess);
  if (Number.isNaN(result.valueOf()) || formatCampDateTime(result, timeZone) !== value) {
    throw new Error("That local date and time does not exist in the camp timezone.");
  }
  return result;
}
