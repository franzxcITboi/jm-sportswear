// ============================================================================
// JM MAKER SPORTSWEAR — SHARED MODULE CONTEXT CONTRACT
// Passed by dashboardController.ts to every dashboard feature module.
// ============================================================================

import type { PageId, SystemState } from "../types/system.types";

export interface ModuleContext {
  state: SystemState;
  navigateTo: (page: PageId, orderId?: string) => void;
  refreshAll: () => void;
  showToast: (message: string) => void;
  printHtml: (htmlContent: string) => void;
  openImagePreview: (src: string, title: string) => void;
}
