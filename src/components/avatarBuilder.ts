// ============================================================================
// JM MAKER SPORTSWEAR — CHARACTER AVATAR SVG BUILDER & STORAGE
// Generates illustrated SVG profile avatars from selected visual traits and
// manages saving/loading the Owner/Manager avatar configuration.
// ============================================================================

import {
  DEFAULT_LOGO_PATH,
  OWNER_AVATAR_CONFIG_KEY,
  OWNER_AVATAR_KEY,
} from "../config/constants";
import type {
  CharacterAccessory,
  CharacterHairStyle,
  OwnerAvatarConfig,
} from "../types/system.types";
import { logWarn } from "../utils/logger";

/** Maps legacy root logo path ("./logo.png") cleanly to the organized asset path. */
function normalizeAssetPath(url?: string): string | undefined {
  if (!url) return undefined;
  if (url === "./logo.png" || url === "logo.png" || url === "/logo.png") {
    return DEFAULT_LOGO_PATH;
  }
  return url;
}

/** Builds an inline SVG data URI for the customized illustrated character avatar. */
export function buildCharacterAvatarDataUrl(
  config: Partial<OwnerAvatarConfig>
): string {
  const bgColor = config.bgColor || "#fee2e2";
  const skinColor = config.skinColor || "#e0ac69";
  const hairStyle: CharacterHairStyle = config.hairStyle || "fade";
  const hairColor = config.hairColor || "#18181b";
  const jerseyColor = config.jerseyColor || "#c62828";
  const accessory: CharacterAccessory = config.accessory || "none";

  const backHairSvg =
    hairStyle === "long"
      ? `<path d="M32 50 C28 72, 30 96, 36 106 L84 106 C90 96, 92 72, 88 50 Z" fill="${hairColor}"/>`
      : hairStyle === "bun"
      ? `<circle cx="60" cy="18" r="11" fill="${hairColor}"/>`
      : "";

  let topHairSvg = "";
  if (hairStyle === "fade") {
    topHairSvg = `<path d="M36 48 C36 28, 84 28, 84 48 C80 39, 40 39, 36 48 Z" fill="${hairColor}"/>`;
  } else if (hairStyle === "part") {
    topHairSvg = `<path d="M35 50 C34 26, 86 26, 85 50 C76 38, 52 36, 35 50 Z" fill="${hairColor}"/>
                  <path d="M47 34 L51 42" stroke="${skinColor}" stroke-width="2" stroke-linecap="round"/>`;
  } else if (hairStyle === "spiky") {
    topHairSvg = `<path d="M35 49 L38 31 L47 37 L55 25 L63 36 L73 27 L79 38 L85 33 L85 49 C74 39, 46 39, 35 49 Z" fill="${hairColor}"/>`;
  } else if (hairStyle === "curly") {
    topHairSvg = `<circle cx="42" cy="36" r="10" fill="${hairColor}"/>
                  <circle cx="54" cy="31" r="11" fill="${hairColor}"/>
                  <circle cx="67" cy="31" r="11" fill="${hairColor}"/>
                  <circle cx="78" cy="37" r="10" fill="${hairColor}"/>
                  <circle cx="36" cy="45" r="7" fill="${hairColor}"/>
                  <circle cx="84" cy="45" r="7" fill="${hairColor}"/>`;
  } else if (hairStyle === "long") {
    topHairSvg = `<path d="M34 52 C34 26, 86 26, 86 52 C77 38, 43 38, 34 52 Z" fill="${hairColor}"/>`;
  } else if (hairStyle === "bun") {
    topHairSvg = `<path d="M36 49 C36 28, 84 28, 84 49 C76 39, 44 39, 36 49 Z" fill="${hairColor}"/>`;
  } else if (hairStyle === "cap") {
    topHairSvg = `<path d="M35 46 C35 26, 85 26, 85 46 Z" fill="${jerseyColor}"/>
                  <path d="M33 44 Q60 39 93 46 Q78 51 35 47 Z" fill="#111827"/>
                  <circle cx="60" cy="29" r="3" fill="#ffffff" opacity="0.85"/>`;
  } else if (hairStyle === "headband") {
    topHairSvg = `<path d="M36 46 C36 27, 84 27, 84 46 Z" fill="${hairColor}"/>
                  <rect x="35" y="40" width="50" height="7" rx="3.5" fill="${jerseyColor}"/>
                  <rect x="35" y="42.5" width="50" height="2" fill="#ffffff" opacity="0.85"/>`;
  }

  const mouthSvg =
    accessory === "grin"
      ? `<path d="M51 67 Q60 75 69 67 Z" fill="#ffffff" stroke="#1f2937" stroke-width="1.8" stroke-linejoin="round"/>`
      : `<path d="M52 68 Q60 74 68 68" fill="none" stroke="#1f2937" stroke-width="2.4" stroke-linecap="round"/>`;

  let accessorySvg = "";
  if (accessory === "glasses") {
    accessorySvg = `
      <g stroke="#1e293b" stroke-width="2.2" fill="rgba(255,255,255,0.25)">
        <rect x="41" y="49" width="15" height="11" rx="3"/>
        <rect x="64" y="49" width="15" height="11" rx="3"/>
        <line x1="56" y1="54" x2="64" y2="54"/>
      </g>`;
  } else if (accessory === "shades") {
    accessorySvg = `
      <g>
        <rect x="40" y="49" width="17" height="11" rx="3" fill="#0f172a"/>
        <rect x="63" y="49" width="17" height="11" rx="3" fill="#0f172a"/>
        <line x1="57" y1="53" x2="63" y2="53" stroke="#0f172a" stroke-width="2.5"/>
        <line x1="43" y1="52" x2="48" y2="57" stroke="#ffffff" stroke-width="1.5" opacity="0.6"/>
        <line x1="66" y1="52" x2="71" y2="57" stroke="#ffffff" stroke-width="1.5" opacity="0.6"/>
      </g>`;
  } else if (accessory === "mic") {
    accessorySvg = `
      <path d="M84 56 Q87 70 66 71" fill="none" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="65" cy="71" r="2.6" fill="#c62828"/>
      <rect x="81" y="51" width="5" height="10" rx="2.5" fill="#0f172a"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <defs>
      <clipPath id="avatarCircleClip">
        <circle cx="60" cy="60" r="58"/>
      </clipPath>
    </defs>
    <circle cx="60" cy="60" r="58" fill="${bgColor}"/>
    <g clip-path="url(#avatarCircleClip)">
      ${backHairSvg}
      <path d="M20 122 C22 93, 40 86, 60 86 C80 86, 98 93, 100 122 Z" fill="${jerseyColor}"/>
      <path d="M28 98 L38 122" stroke="#ffffff" stroke-width="3.5" opacity="0.75"/>
      <path d="M92 98 L82 122" stroke="#ffffff" stroke-width="3.5" opacity="0.75"/>
      <rect x="52" y="73" width="16" height="18" rx="6" fill="${skinColor}"/>
      <path d="M52 78 Q60 84 68 78" fill="rgba(0,0,0,0.12)"/>
      <path d="M47 86 L60 101 L73 86" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/>
      <circle cx="35" cy="56" r="5.5" fill="${skinColor}"/>
      <circle cx="85" cy="56" r="5.5" fill="${skinColor}"/>
      <rect x="36" y="31" width="48" height="48" rx="23" fill="${skinColor}"/>
      <path d="M45 47 Q49 45 53 47" fill="none" stroke="${hairColor}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M67 47 Q71 45 75 47" fill="none" stroke="${hairColor}" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="49" cy="54" r="3" fill="#1e293b"/>
      <circle cx="71" cy="54" r="3" fill="#1e293b"/>
      <circle cx="50" cy="53" r="1" fill="#ffffff"/>
      <circle cx="72" cy="53" r="1" fill="#ffffff"/>
      <ellipse cx="44" cy="61" rx="3.5" ry="2" fill="#f43f5e" opacity="0.22"/>
      <ellipse cx="76" cy="61" rx="3.5" ry="2" fill="#f43f5e" opacity="0.22"/>
      <path d="M60 55 L58.5 61 L61.5 61" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      ${mouthSvg}
      ${topHairSvg}
      ${accessorySvg}
    </g>
    <circle cx="60" cy="60" r="58" fill="none" stroke="rgba(15,23,42,0.12)" stroke-width="2"/>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Loads the Owner/Manager avatar configuration from localStorage. */
export function getOwnerAvatarConfig(): OwnerAvatarConfig {
  try {
    const raw = localStorage.getItem(OWNER_AVATAR_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OwnerAvatarConfig> & {
        mode?: string;
      };
      return {
        mode: parsed.mode === "upload" ? "upload" : "custom",
        uploadedDataUrl: normalizeAssetPath(parsed.uploadedDataUrl),
        bgColor: parsed.bgColor || "#fee2e2",
        skinColor: parsed.skinColor || "#e0ac69",
        hairStyle: parsed.hairStyle || "fade",
        hairColor: parsed.hairColor || "#18181b",
        jerseyColor: parsed.jerseyColor || "#c62828",
        accessory: parsed.accessory || "none",
      };
    }
  } catch (err) {
    logWarn("AvatarBuilder", "Could not parse saved avatar config; using defaults.", err);
  }

  const legacyUpload = normalizeAssetPath(
    localStorage.getItem(OWNER_AVATAR_KEY) || undefined
  );
  if (legacyUpload) {
    return {
      mode: "upload",
      uploadedDataUrl: legacyUpload,
      bgColor: "#fee2e2",
      skinColor: "#e0ac69",
      hairStyle: "fade",
      hairColor: "#18181b",
      jerseyColor: "#c62828",
      accessory: "none",
    };
  }

  return {
    mode: "upload",
    uploadedDataUrl: DEFAULT_LOGO_PATH,
    bgColor: "#fee2e2",
    skinColor: "#e0ac69",
    hairStyle: "fade",
    hairColor: "#18181b",
    jerseyColor: "#c62828",
    accessory: "none",
  };
}

/** Saves the Owner/Manager avatar configuration to localStorage. */
export function saveOwnerAvatarConfig(config: OwnerAvatarConfig): void {
  localStorage.setItem(OWNER_AVATAR_CONFIG_KEY, JSON.stringify(config));
  if (config.mode === "upload" && config.uploadedDataUrl) {
    localStorage.setItem(OWNER_AVATAR_KEY, config.uploadedDataUrl);
  }
}

/** Resolves the current image source (uploaded photo, logo, or SVG avatar). */
export function getOwnerAvatar(): string {
  const cfg = getOwnerAvatarConfig();
  if (cfg.mode === "upload" && cfg.uploadedDataUrl) {
    return cfg.uploadedDataUrl;
  }
  return buildCharacterAvatarDataUrl(cfg);
}
