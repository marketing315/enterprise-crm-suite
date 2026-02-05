/**
 * Parse Italian natural language time expressions into a timestamp
 * Timezone: Europe/Rome
 */

export interface ParseResult {
  run_at: Date;
  run_at_utc: string;
  run_at_local: string;
  confidence: number;
  strategy: string;
  notes: string;
}

// Default time for "domani", "oggi pomeriggio", etc.
const DEFAULT_TIMES = {
  mattina: { hour: 9, minute: 30 },
  pomeriggio: { hour: 15, minute: 30 },
  sera: { hour: 19, minute: 0 },
  default: { hour: 9, minute: 30 },
};

export function parseCallbackTime(
  esitoChiamata: string,
  baseTime: Date = new Date()
): ParseResult {
  const text = esitoChiamata.toLowerCase().trim();
  let runAt: Date;
  let confidence = 0.9;
  let notes = "";

  // Pattern: "tra X minuti"
  const minutesMatch = text.match(/tra\s+(\d+)\s*min/i);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1], 10);
    runAt = new Date(baseTime.getTime() + minutes * 60 * 1000);
    notes = `Parsed as now + ${minutes} minutes`;
    return formatResult(runAt, confidence, "minutes_offset", notes);
  }

  // Pattern: "tra X ore"
  const hoursMatch = text.match(/tra\s+(\d+)\s*or[ae]/i);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1], 10);
    runAt = new Date(baseTime.getTime() + hours * 60 * 60 * 1000);
    notes = `Parsed as now + ${hours} hours`;
    return formatResult(runAt, confidence, "hours_offset", notes);
  }

  // Pattern: "tra mezz'ora" or "tra mezzora"
  if (text.includes("mezz") && text.includes("ora")) {
    runAt = new Date(baseTime.getTime() + 30 * 60 * 1000);
    notes = "Parsed as now + 30 minutes";
    return formatResult(runAt, confidence, "half_hour", notes);
  }

  // Pattern: "tra un'ora"
  if (text.match(/tra\s+un['']?\s*ora/i)) {
    runAt = new Date(baseTime.getTime() + 60 * 60 * 1000);
    notes = "Parsed as now + 1 hour";
    return formatResult(runAt, confidence, "one_hour", notes);
  }

  // Pattern: "domani" (with optional time of day)
  if (text.includes("domani")) {
    runAt = new Date(baseTime);
    runAt.setDate(runAt.getDate() + 1);
    
    if (text.includes("mattina")) {
      runAt.setHours(DEFAULT_TIMES.mattina.hour, DEFAULT_TIMES.mattina.minute, 0, 0);
      notes = "Parsed as tomorrow morning";
    } else if (text.includes("pomeriggio")) {
      runAt.setHours(DEFAULT_TIMES.pomeriggio.hour, DEFAULT_TIMES.pomeriggio.minute, 0, 0);
      notes = "Parsed as tomorrow afternoon";
    } else if (text.includes("sera")) {
      runAt.setHours(DEFAULT_TIMES.sera.hour, DEFAULT_TIMES.sera.minute, 0, 0);
      notes = "Parsed as tomorrow evening";
    } else {
      runAt.setHours(DEFAULT_TIMES.default.hour, DEFAULT_TIMES.default.minute, 0, 0);
      notes = "Parsed as tomorrow at default time (09:30)";
    }
    
    return formatResult(runAt, confidence, "tomorrow", notes);
  }

  // Pattern: "oggi pomeriggio"
  if (text.includes("oggi") && text.includes("pomeriggio")) {
    runAt = new Date(baseTime);
    runAt.setHours(DEFAULT_TIMES.pomeriggio.hour, DEFAULT_TIMES.pomeriggio.minute, 0, 0);
    
    // If it's already past that time, schedule for tomorrow
    if (runAt <= baseTime) {
      runAt.setDate(runAt.getDate() + 1);
      notes = "Parsed as today afternoon (moved to tomorrow - past time)";
    } else {
      notes = "Parsed as today afternoon";
    }
    
    return formatResult(runAt, confidence, "today_afternoon", notes);
  }

  // Pattern: "stasera"
  if (text.includes("stasera") || (text.includes("oggi") && text.includes("sera"))) {
    runAt = new Date(baseTime);
    runAt.setHours(DEFAULT_TIMES.sera.hour, DEFAULT_TIMES.sera.minute, 0, 0);
    
    if (runAt <= baseTime) {
      runAt.setDate(runAt.getDate() + 1);
      notes = "Parsed as this evening (moved to tomorrow - past time)";
    } else {
      notes = "Parsed as this evening";
    }
    
    return formatResult(runAt, confidence, "this_evening", notes);
  }

  // Pattern: "stamattina" or "questa mattina"
  if (text.includes("stamattina") || (text.includes("questa") && text.includes("mattina"))) {
    runAt = new Date(baseTime);
    runAt.setHours(DEFAULT_TIMES.mattina.hour, DEFAULT_TIMES.mattina.minute, 0, 0);
    
    if (runAt <= baseTime) {
      runAt.setDate(runAt.getDate() + 1);
      notes = "Parsed as this morning (moved to tomorrow - past time)";
    } else {
      notes = "Parsed as this morning";
    }
    
    return formatResult(runAt, confidence, "this_morning", notes);
  }

  // Pattern: explicit time "alle HH:MM" or "ore HH:MM"
  const timeMatch = text.match(/(?:alle|ore)\s*(\d{1,2})[:.](\d{2})/i);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    
    runAt = new Date(baseTime);
    runAt.setHours(hours, minutes, 0, 0);
    
    // If time is in the past, schedule for tomorrow
    if (runAt <= baseTime) {
      runAt.setDate(runAt.getDate() + 1);
      notes = `Parsed as ${hours}:${minutes.toString().padStart(2, '0')} (moved to tomorrow)`;
    } else {
      notes = `Parsed as ${hours}:${minutes.toString().padStart(2, '0')}`;
    }
    
    return formatResult(runAt, 0.95, "explicit_time", notes);
  }

  // Pattern: date "DD/MM" or "DD-MM"
  const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:\s+(?:alle|ore)\s*(\d{1,2})[:.](\d{2}))?/i);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1; // JS months are 0-indexed
    const hours = dateMatch[3] ? parseInt(dateMatch[3], 10) : DEFAULT_TIMES.default.hour;
    const minutes = dateMatch[4] ? parseInt(dateMatch[4], 10) : DEFAULT_TIMES.default.minute;
    
    runAt = new Date(baseTime);
    runAt.setMonth(month, day);
    runAt.setHours(hours, minutes, 0, 0);
    
    // If date is in the past, assume next year
    if (runAt <= baseTime) {
      runAt.setFullYear(runAt.getFullYear() + 1);
      notes = `Parsed as ${day}/${month + 1} at ${hours}:${minutes.toString().padStart(2, '0')} (next year)`;
    } else {
      notes = `Parsed as ${day}/${month + 1} at ${hours}:${minutes.toString().padStart(2, '0')}`;
    }
    
    return formatResult(runAt, 0.85, "explicit_date", notes);
  }

  // Pattern: "lunedì", "martedì", etc.
  const weekdays = [
    { name: "domenica", index: 0 },
    { name: "lunedì", index: 1 },
    { name: "lunedi", index: 1 },
    { name: "martedì", index: 2 },
    { name: "martedi", index: 2 },
    { name: "mercoledì", index: 3 },
    { name: "mercoledi", index: 3 },
    { name: "giovedì", index: 4 },
    { name: "giovedi", index: 4 },
    { name: "venerdì", index: 5 },
    { name: "venerdi", index: 5 },
    { name: "sabato", index: 6 },
  ];

  for (const { name, index } of weekdays) {
    if (text.includes(name)) {
      runAt = new Date(baseTime);
      const currentDay = runAt.getDay();
      let daysToAdd = index - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7; // Next week if today or past
      
      runAt.setDate(runAt.getDate() + daysToAdd);
      runAt.setHours(DEFAULT_TIMES.default.hour, DEFAULT_TIMES.default.minute, 0, 0);
      
      notes = `Parsed as next ${name} at default time`;
      return formatResult(runAt, 0.85, "weekday", notes);
    }
  }

  // Default: 60 minutes from now (ambiguous input)
  runAt = new Date(baseTime.getTime() + 60 * 60 * 1000);
  notes = "Ambiguous input - defaulting to now + 60 minutes";
  confidence = 0.5;

  return formatResult(runAt, confidence, "default_fallback", notes);
}

function formatResult(
  runAt: Date,
  confidence: number,
  strategy: string,
  notes: string
): ParseResult {
  return {
    run_at: runAt,
    run_at_utc: runAt.toISOString(),
    run_at_local: formatLocalTime(runAt),
    confidence,
    strategy: `rules_v1.${strategy}`,
    notes,
  };
}

function formatLocalTime(date: Date): string {
  // Format as Europe/Rome local time
  return date.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
