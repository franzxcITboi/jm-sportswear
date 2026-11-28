// ============================================================================
// JM MAKER SPORTSWEAR — PROFILE & CHARACTER AVATAR MODAL COMPONENT
// Encapsulates the avatar customization modal UI and event wiring cleanly
// outside the main dashboard shell controller.
// ============================================================================

import {
  AVATAR_COLORS,
  CHARACTER_ACCESSORIES,
  CHARACTER_HAIR_COLORS,
  CHARACTER_HAIR_STYLES,
  CHARACTER_JERSEY_COLORS,
  CHARACTER_SKIN_TONES,
  DEFAULT_LOGO_PATH,
} from "../config/constants";
import type {
  CharacterAccessory,
  CharacterHairStyle,
  OwnerAvatarConfig,
} from "../types/system.types";
import { getOwnerSession } from "../services/authService";
import { updateOwnerProfileInSupabase } from "../services/supabaseRepository";
import { compressImageFile } from "../utils/imageCompressor";
import { logError } from "../utils/logger";
import {
  buildCharacterAvatarDataUrl,
  getOwnerAvatar,
  getOwnerAvatarConfig,
  saveOwnerAvatarConfig,
} from "./avatarBuilder";

function renderSwatchButtons(
  items: Array<{ label: string; hex: string }>,
  activeHex: string | undefined,
  isCustomMode: boolean,
  dataAttr: string
): string {
  const current = (activeHex || "").toLowerCase();
  return items
    .map((item) => {
      const isSelected = isCustomMode && current === item.hex.toLowerCase();
      return `
        <button
          type="button"
          class="avatar-color-swatch ${isSelected ? "active" : ""}"
          style="background:${item.hex};"
          ${dataAttr}="${item.hex}"
          title="${item.label}"
        ></button>
      `;
    })
    .join("");
}

export function initAvatarCustomizationModal(
  showToast: (message: string) => void
): void {
  const modal = document.getElementById("profileAvatarModal");
  const avatarImg = document.getElementById(
    "ownerAvatarImg"
  ) as HTMLImageElement | null;
  const modalPreviewImg = document.getElementById(
    "avatarModalPreviewImg"
  ) as HTMLImageElement | null;
  const hairStyleGrid = document.getElementById("charHairStyleGrid");
  const accessoryGrid = document.getElementById("charAccessoryGrid");
  const skinColorGrid = document.getElementById("charSkinColorGrid");
  const hairColorGrid = document.getElementById("charHairColorGrid");
  const jerseyColorGrid = document.getElementById("charJerseyColorGrid");
  const colorGrid = document.getElementById("avatarColorGrid");
  const avatarInput = document.getElementById(
    "ownerAvatarInput"
  ) as HTMLInputElement | null;

  let draftConfig: OwnerAvatarConfig = getOwnerAvatarConfig();

  function getDraftPreviewSrc(): string {
    if (draftConfig.mode === "custom") {
      return buildCharacterAvatarDataUrl(draftConfig);
    }
    return draftConfig.uploadedDataUrl || DEFAULT_LOGO_PATH;
  }

  function renderModalState(): void {
    const isCustom = draftConfig.mode === "custom";

    if (modalPreviewImg) {
      modalPreviewImg.src = getDraftPreviewSrc();
    }

    if (hairStyleGrid) {
      hairStyleGrid.innerHTML = CHARACTER_HAIR_STYLES.map((hs) => {
        const isSelected = isCustom && draftConfig.hairStyle === hs.id;
        return `
          <button
            type="button"
            class="char-chip-btn ${isSelected ? "active" : ""}"
            data-hair-style="${hs.id}"
          >
            ${hs.label}
          </button>
        `;
      }).join("");
    }

    if (accessoryGrid) {
      accessoryGrid.innerHTML = CHARACTER_ACCESSORIES.map((acc) => {
        const isSelected = isCustom && draftConfig.accessory === acc.id;
        return `
          <button
            type="button"
            class="char-chip-btn ${isSelected ? "active" : ""}"
            data-accessory="${acc.id}"
          >
            ${acc.label}
          </button>
        `;
      }).join("");
    }

    if (skinColorGrid) {
      skinColorGrid.innerHTML = renderSwatchButtons(
        CHARACTER_SKIN_TONES,
        draftConfig.skinColor,
        isCustom,
        "data-skin-hex"
      );
    }

    if (hairColorGrid) {
      hairColorGrid.innerHTML = renderSwatchButtons(
        CHARACTER_HAIR_COLORS,
        draftConfig.hairColor,
        isCustom,
        "data-hair-hex"
      );
    }

    if (jerseyColorGrid) {
      jerseyColorGrid.innerHTML = renderSwatchButtons(
        CHARACTER_JERSEY_COLORS,
        draftConfig.jerseyColor,
        isCustom,
        "data-jersey-hex"
      );
    }

    if (colorGrid) {
      colorGrid.innerHTML = renderSwatchButtons(
        AVATAR_COLORS,
        draftConfig.bgColor,
        isCustom,
        "data-color-hex"
      );
    }
  }

  function openModal(): void {
    draftConfig = { ...getOwnerAvatarConfig() };
    renderModalState();
    if (modal) modal.hidden = false;
  }

  function closeModal(): void {
    if (modal) modal.hidden = true;
  }

  document
    .getElementById("ownerProfileBtn")
    ?.addEventListener("click", openModal);
  document
    .getElementById("closeProfileModalBtn")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("cancelProfileModalBtn")
    ?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "profileAvatarModal") {
      closeModal();
    }
  });

  document
    .getElementById("triggerUploadAvatarBtn")
    ?.addEventListener("click", () => avatarInput?.click());

  avatarInput?.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 320, 0.85);
      draftConfig = {
        ...draftConfig,
        mode: "upload",
        uploadedDataUrl: compressed,
      };
      renderModalState();
    } catch (err) {
      logError("AvatarModal", "Failed to compress uploaded profile photo.", err);
      showToast("Could not load photo. Please choose a JPG, PNG, or WEBP image.");
    }
  });

  document
    .getElementById("resetDefaultAvatarBtn")
    ?.addEventListener("click", () => {
      draftConfig = {
        mode: "upload",
        uploadedDataUrl: DEFAULT_LOGO_PATH,
        bgColor: "#fee2e2",
        skinColor: "#e0ac69",
        hairStyle: "fade",
        hairColor: "#18181b",
        jerseyColor: "#c62828",
        accessory: "none",
      };
      if (avatarInput) avatarInput.value = "";
      renderModalState();
    });

  hairStyleGrid?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-hair-style]");
    const hairStyle = btn?.getAttribute("data-hair-style") as
      | CharacterHairStyle
      | undefined;
    if (!hairStyle) return;
    draftConfig = { ...draftConfig, mode: "custom", hairStyle };
    renderModalState();
  });

  accessoryGrid?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-accessory]");
    const accessory = btn?.getAttribute("data-accessory") as
      | CharacterAccessory
      | undefined;
    if (!accessory) return;
    draftConfig = { ...draftConfig, mode: "custom", accessory };
    renderModalState();
  });

  skinColorGrid?.addEventListener("click", (e) => {
    const hex = (e.target as HTMLElement)
      .closest("[data-skin-hex]")
      ?.getAttribute("data-skin-hex");
    if (!hex) return;
    draftConfig = { ...draftConfig, mode: "custom", skinColor: hex };
    renderModalState();
  });

  hairColorGrid?.addEventListener("click", (e) => {
    const hex = (e.target as HTMLElement)
      .closest("[data-hair-hex]")
      ?.getAttribute("data-hair-hex");
    if (!hex) return;
    draftConfig = { ...draftConfig, mode: "custom", hairColor: hex };
    renderModalState();
  });

  jerseyColorGrid?.addEventListener("click", (e) => {
    const hex = (e.target as HTMLElement)
      .closest("[data-jersey-hex]")
      ?.getAttribute("data-jersey-hex");
    if (!hex) return;
    draftConfig = { ...draftConfig, mode: "custom", jerseyColor: hex };
    renderModalState();
  });

  colorGrid?.addEventListener("click", (e) => {
    const hex = (e.target as HTMLElement)
      .closest("[data-color-hex]")
      ?.getAttribute("data-color-hex");
    if (!hex) return;
    draftConfig = { ...draftConfig, mode: "custom", bgColor: hex };
    renderModalState();
  });

  document
    .getElementById("saveProfileAvatarBtn")
    ?.addEventListener("click", () => {
      saveOwnerAvatarConfig(draftConfig);
      const session = getOwnerSession();
      if (session?.userId) {
        void updateOwnerProfileInSupabase(session.userId, {
          avatarConfig: draftConfig,
        });
      }
      if (avatarImg) {
        avatarImg.src = getOwnerAvatar();
      }
      closeModal();
      showToast("Profile avatar saved and applied.");
    });
}
