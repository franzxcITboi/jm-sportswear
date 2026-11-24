// ============================================================================
// JM MAKER SPORTSWEAR — APPLICATION CONSTANTS & CONFIGURATION
// Centralized pricing tables, storage keys, workflow stages, asset paths,
// and avatar customization palettes.
// ============================================================================

import type {
  CharacterAccessory,
  CharacterHairStyle,
  WorkflowStage,
} from "../types/system.types";

/** Public asset paths served from /public/images/ */
export const DEFAULT_LOGO_PATH = "./images/logo.png";

/** Current localStorage keys (preserved identically to prevent data loss) */
export const STORAGE_KEY = "jm_pos_inventory_system_v3";
export const LEGACY_STORAGE_KEYS = [
  "jm_pos_inventory_system_v2",
  "jm_pos_inventory_system_v1",
];
export const OWNER_AVATAR_KEY = "jm_owner_custom_avatar";
export const OWNER_AVATAR_CONFIG_KEY = "jm_owner_avatar_config_v3";
export const THEME_STORAGE_KEY = "jm_dashboard_theme";

/** Active sequential fulfillment stages (Steps 1–4 before Released/Fulfilled) */
export const WORKFLOW_STAGES: WorkflowStage[] = [
  "Order Received",
  "Production",
  "Quality Inspection",
  "Ready for Release",
];

/** Per-piece surcharge added for XXL+ custom jerseys */
export const XXL_SURCHARGE_PER_PIECE = 50;

/** Default low-stock threshold for Finished Goods Inventory */
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

/** Pricing lookup table for apparel packages */
export const SUBLIMATION_PRICES: Record<string, number> = {
  "Full Sublimation Set (Jersey + Shorts)": 800,
  "Sublimation Upper Jersey Only": 550,
  "Custom Team Polo Shirt": 650,
  "Sleeveless Sublimation Jersey": 500,
  "Stock Blank Jersey": 350,
  "Sublimation Type-A (Full Set)": 800,
  "Sublimation Type-B (Upper Only)": 550,
  "Custom Team Polo": 650,
};

/** Selectable custom order package options shown in Custom Orders & POS */
export const ORDER_PACKAGE_OPTIONS: Array<{ label: string; price: number }> = [
  { label: "Full Sublimation Set (Jersey + Shorts)", price: 800 },
  { label: "Sublimation Upper Jersey Only", price: 550 },
  { label: "Custom Team Polo Shirt", price: 650 },
  { label: "Sleeveless Sublimation Jersey", price: 500 },
];

// ================= AVATAR CUSTOMIZATION OPTIONS =================

export const CHARACTER_HAIR_STYLES: Array<{
  id: CharacterHairStyle;
  label: string;
}> = [
  { id: "fade", label: "Short Fade" },
  { id: "part", label: "Classic Part" },
  { id: "spiky", label: "Spiky Crop" },
  { id: "curly", label: "Curly Afro" },
  { id: "long", label: "Long Wavy" },
  { id: "bun", label: "Top Bun" },
  { id: "cap", label: "Sports Cap" },
  { id: "headband", label: "Headband" },
];

export const CHARACTER_ACCESSORIES: Array<{
  id: CharacterAccessory;
  label: string;
}> = [
  { id: "none", label: "Friendly Smile" },
  { id: "grin", label: "Big Grin" },
  { id: "glasses", label: "Eyeglasses" },
  { id: "shades", label: "Sunglasses" },
  { id: "mic", label: "Pro Headset" },
];

export const CHARACTER_SKIN_TONES: Array<{
  id: string;
  label: string;
  hex: string;
}> = [
  { id: "light", label: "Light", hex: "#fde2c8" },
  { id: "fair", label: "Fair", hex: "#f5cba7" },
  { id: "tan", label: "Warm Tan", hex: "#e0ac69" },
  { id: "moreno", label: "Moreno", hex: "#c68642" },
  { id: "deep", label: "Deep Brown", hex: "#8d5524" },
];

export const CHARACTER_HAIR_COLORS: Array<{
  id: string;
  label: string;
  hex: string;
}> = [
  { id: "black", label: "Jet Black", hex: "#18181b" },
  { id: "brown", label: "Chestnut Brown", hex: "#451a03" },
  { id: "auburn", label: "Auburn Red", hex: "#9a3412" },
  { id: "blonde", label: "Golden Blonde", hex: "#ca8a04" },
  { id: "silver", label: "Silver Grey", hex: "#64748b" },
];

export const CHARACTER_JERSEY_COLORS: Array<{
  id: string;
  label: string;
  hex: string;
}> = [
  { id: "crimson", label: "JM Crimson", hex: "#c62828" },
  { id: "navy", label: "Royal Blue", hex: "#1d4ed8" },
  { id: "emerald", label: "Court Green", hex: "#047857" },
  { id: "gold", label: "Trophy Gold", hex: "#d97706" },
  { id: "charcoal", label: "Stealth Black", hex: "#1f2937" },
  { id: "violet", label: "All-Star Violet", hex: "#6d28d9" },
];

export const AVATAR_COLORS: Array<{ id: string; label: string; hex: string }> = [
  { id: "soft-red", label: "Soft Crimson", hex: "#fee2e2" },
  { id: "soft-blue", label: "Court Sky", hex: "#dbeafe" },
  { id: "soft-emerald", label: "Mint Studio", hex: "#d1fae5" },
  { id: "soft-gold", label: "Warm Gold", hex: "#fef3c7" },
  { id: "soft-violet", label: "Soft Violet", hex: "#ede9fe" },
  { id: "dark-arena", label: "Night Arena", hex: "#1e293b" },
  { id: "bold-red", label: "Bold Red", hex: "#c62828" },
];
