// ============================================================================
// JM MAKER SPORTSWEAR — DISPLAY & DATE FORMATTERS
// Pure formatting helpers for currency, timestamps, jersey size summaries,
// and user-friendly fulfillment stage labels.
// ============================================================================

import type { SizeBreakdown, WorkflowStage } from "../types/system.types";

/** Formats a numeric value in Philippine Peso (e.g., ₱1,250 or ₱1,250.00). */
export function formatPeso(amount: number, withDecimals = false): string {
  return `\u20B1${(Number(amount) || 0).toLocaleString("en-PH", {
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  })}`;
}

/** Returns a short time stamp for today (e.g., "Today 02:35 PM"). */
export function formatTimeNow(): string {
  const now = new Date();
  return `Today ${now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Returns a full logbook date & time string (e.g., "Nov 22, 2026 • 02:35 PM"). */
export function formatLogbookDateNow(): string {
  const now = new Date();
  const datePart = now.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const timePart = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} \u2022 ${timePart}`;
}

/** Returns local calendar date formatted as YYYY-MM-DD. */
export function getTodayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Attempts to parse an ISO date (YYYY-MM-DD) from a formatted logbook date string. */
export function inferIsoDateFromDisplay(dateTime: string): string {
  if (!dateTime) return getTodayIsoDate();
  const datePart = dateTime.split("\u2022")[0]?.trim() || "";
  const parsed = new Date(datePart);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return getTodayIsoDate();
}

/** Formats non-zero jersey sizes into a compact string (e.g., "S:2, M:4, XXL+:1"). */
export function formatSizeSummary(sizes: SizeBreakdown): string {
  const parts: string[] = [];
  (Object.keys(sizes) as Array<keyof SizeBreakdown>).forEach((sizeKey) => {
    const count = sizes[sizeKey];
    if (count > 0) {
      parts.push(`${sizeKey === "XXL" ? "XXL+" : sizeKey}:${count}`);
    }
  });
  return parts.length > 0 ? parts.join(", ") : "No sizes set";
}

/** Maps internal WorkflowStage values to clear user-facing step labels. */
export function formatStageEcommerce(stage: WorkflowStage): string {
  switch (stage) {
    case "Order Received":
      return "Review Order";
    case "Production":
      return "Prepare Order";
    case "Quality Inspection":
      return "Check Order";
    case "Ready for Release":
      return "Ready to Complete";
    case "Released":
      return "Fulfilled";
    case "Cancelled":
      return "Cancelled";
  }
}
