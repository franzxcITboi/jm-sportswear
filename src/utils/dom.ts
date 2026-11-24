// ============================================================================
// JM MAKER SPORTSWEAR — SHARED DOM & UI INTERACTION HELPERS
// Eliminates repeated clipboard, search-input focus restoration, and image
// preview delegation code across dashboard modules.
// ============================================================================

import { logWarn } from "./logger";

/**
 * Restores focus and cursor position to a search input immediately after a
 * container re-renders on live input filtering.
 */
export function restoreInputFocus(inputId: string): void {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (!input) return;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

/**
 * Checks if a click originated inside a `[data-preview-src]` trigger and
 * opens the shared image lightbox modal when found.
 * Returns true if the click was handled.
 */
export function handleImagePreviewClick(
  target: HTMLElement,
  openImagePreview: (src: string, title: string) => void,
  fallbackTitle = "Image Preview",
  stopPropagation = false,
  event?: Event
): boolean {
  const previewEl = target.closest(
    "[data-preview-src]"
  ) as HTMLElement | null;
  if (!previewEl) return false;
  if (stopPropagation && event) {
    event.stopPropagation();
  }
  const src = previewEl.getAttribute("data-preview-src") || "";
  const title = previewEl.getAttribute("data-preview-title") || fallbackTitle;
  if (src) {
    openImagePreview(src, title);
  }
  return true;
}

/**
 * Copies plain text to the user's clipboard using the modern Clipboard API,
 * falling back cleanly to a temporary textarea when unavailable.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    logWarn("Clipboard", "Clipboard API unavailable, falling back to execCommand.", err);
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch (err) {
    logWarn("Clipboard", "Fallback copy failed.", err);
    return false;
  }
}
