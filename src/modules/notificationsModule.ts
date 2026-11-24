// ============================================================================
// JM MAKER SPORTSWEAR — NOTIFICATIONS & STORE ALERTS MODULE
// Displays centralized store alerts, syncs sidebar/topbar unread badges,
// filters by category, and links directly to affected pages or orders.
// ============================================================================

import type { PageId } from "../types/system.types";
import type { ModuleContext } from "./moduleTypes";

export function initNotificationsModule(ctx: ModuleContext): {
  render: () => void;
} {
  const container = document.getElementById("notificationsPageContent");
  let activeCategory = "ALL";

  function updateBellBadges(): void {
    const unreadCount = ctx.state.notifications.filter((n) => !n.read).length;
    const topBadge = document.getElementById("topbarNotifBadge");
    const navBadge = document.getElementById("navNotifBadge");

    if (topBadge) {
      topBadge.textContent = String(unreadCount);
      topBadge.hidden = unreadCount === 0;
    }
    if (navBadge) {
      navBadge.textContent = String(unreadCount);
      navBadge.hidden = unreadCount === 0;
    }
  }

  function render(): void {
    updateBellBadges();
    if (!container) return;

    const unreadCount = ctx.state.notifications.filter((n) => !n.read).length;

    const filtered = ctx.state.notifications.filter((n) => {
      if (activeCategory === "ALL") return true;
      if (activeCategory === "UNREAD") return !n.read;
      return n.category === activeCategory;
    });

    const cardsHtml =
      filtered.length > 0
        ? filtered
            .map((n) => {
              let sevBadge = "tag-blue";
              if (n.severity === "urgent") sevBadge = "tag-red";
              if (n.severity === "warning") sevBadge = "tag-amber";
              if (n.severity === "success") sevBadge = "tag-green";

              return `
                <article class="notif-card ${
                  n.read ? "notif-read" : "notif-unread"
                }">
                  <div class="notif-main">
                    <div class="notif-meta-row">
                      <span class="module-tag ${sevBadge}">${n.category}</span>
                      <span class="notif-time">${n.timestamp}</span>
                      ${
                        !n.read
                          ? `<span class="unread-pill">NEW</span>`
                          : `<span style="font-size:0.72rem;color:var(--text-muted);">Read</span>`
                      }
                    </div>
                    <h3 class="notif-title">${n.title}</h3>
                    <p class="notif-desc">${n.message}</p>
                  </div>
                  <div class="notif-actions">
                    <button
                      type="button"
                      class="btn btn-red btn-sm"
                      data-notif-open="${n.id}"
                      data-target-page="${n.targetPage}"
                      data-order-id="${n.linkedOrderId || ""}"
                    >
                      View &rarr;
                    </button>
                    ${
                      !n.read
                        ? `<button type="button" class="btn btn-light btn-sm" data-notif-read="${n.id}">Mark Read</button>`
                        : ""
                    }
                  </div>
                </article>
              `;
            })
            .join("")
        : `<div class="module-card">
            <div class="empty-state-panel">
              <p class="empty-state-title">No notifications yet</p>
              <p class="empty-state-desc">Store alerts for custom orders, fulfillment updates, inventory stock levels, and buyer payment proofs will appear here automatically.</p>
            </div>
          </div>`;

    container.innerHTML = `
      <div class="page-toolbar">
        <div class="toolbar-group">
          <button type="button" class="btn ${
            activeCategory === "ALL" ? "btn-red" : "btn-light"
          } btn-sm" data-cat="ALL">All (${ctx.state.notifications.length})</button>
          <button type="button" class="btn ${
            activeCategory === "UNREAD" ? "btn-red" : "btn-light"
          } btn-sm" data-cat="UNREAD">Unread (${unreadCount})</button>
          <button type="button" class="btn ${
            activeCategory === "Orders & Payments" ? "btn-red" : "btn-light"
          } btn-sm" data-cat="Orders & Payments">Orders &amp; Payments</button>
          <button type="button" class="btn ${
            activeCategory === "Fulfillment" ? "btn-red" : "btn-light"
          } btn-sm" data-cat="Fulfillment">Fulfillment</button>
          <button type="button" class="btn ${
            activeCategory === "Inventory" ? "btn-red" : "btn-light"
          } btn-sm" data-cat="Inventory">Stock</button>
          <button type="button" class="btn ${
            activeCategory === "Store" ? "btn-red" : "btn-light"
          } btn-sm" data-cat="Store">Store</button>
        </div>

        <div class="toolbar-group">
          <button type="button" id="notifMarkAllReadBtn" class="btn btn-light btn-sm" ${
            unreadCount === 0 ? "disabled" : ""
          }>
            &#10003; Mark All Read
          </button>
        </div>
      </div>

      <div class="notif-list-stack">${cardsHtml}</div>
    `;
  }

  container?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    const catBtn = target.closest("[data-cat]") as HTMLElement | null;
    if (catBtn) {
      activeCategory = catBtn.getAttribute("data-cat") || "ALL";
      render();
      return;
    }

    if (target.id === "notifMarkAllReadBtn") {
      ctx.state.notifications.forEach((n) => {
        n.read = true;
      });
      ctx.refreshAll();
      ctx.showToast("All notifications marked as read.");
      return;
    }

    const markBtn = target.closest("[data-notif-read]") as HTMLElement | null;
    if (markBtn) {
      const id = markBtn.getAttribute("data-notif-read");
      const item = ctx.state.notifications.find((n) => n.id === id);
      if (item) {
        item.read = true;
        ctx.refreshAll();
      }
      return;
    }

    const openBtn = target.closest("[data-notif-open]") as HTMLElement | null;
    if (openBtn) {
      const id = openBtn.getAttribute("data-notif-open");
      const page = openBtn.getAttribute("data-target-page") as PageId;
      const orderId = openBtn.getAttribute("data-order-id") || undefined;
      const item = ctx.state.notifications.find((n) => n.id === id);
      if (item) item.read = true;
      if (page) ctx.navigateTo(page, orderId);
    }
  });

  return { render };
}
