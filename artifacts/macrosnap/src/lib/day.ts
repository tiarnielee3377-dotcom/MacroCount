export function getDeviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function getLocalDay() {
  const parts = Intl.DateTimeFormat("en-US", {
    timeZone: getDeviceTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftLocalDay(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + amount);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalWeekStart(date = getLocalDay()) {
  const value = new Date(`${date}T00:00:00`);
  const mondayOffset = (value.getDay() + 6) % 7;
  return shiftLocalDay(date, -mondayOffset);
}