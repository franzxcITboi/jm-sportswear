// ============================================================================
// JM MAKER SPORTSWEAR — FINISHED GOODS INVENTORY MODULE
// Manages ready-made sportswear stock, product photos, inline selling price
// edits, stock search/filtering, and consolidated single-entry walk-in sales.
// ============================================================================

import {
  appendAuditLog,
  appendLogbookEntry,
  pushNotification,
} from "../store/systemStore";
import type { LogbookPaymentType, PaymentMethod } from "../types/system.types";
import { computeStockStatus } from "../utils/calculations";
import { handleImagePreviewClick, restoreInputFocus } from "../utils/dom";
import { formatPeso } from "../utils/formatters";
import { compressImageFile } from "../utils/imageCompressor";
import { logError } from "../utils/logger";
import type { ModuleContext } from "./moduleTypes";

type StockFilter = "ALL" | "In Stock" | "Low Stock" | "Out of Stock";

export function initInventoryModule(ctx: ModuleContext): { render: () => void } {
  const container = document.getElementById("inventoryPageContent");

  let stockFilter: StockFilter = "ALL";
  let searchQuery = "";
  let stagedProductImage: string | undefined;
  let stagedProductImageName: string | undefined;
  let editingPriceItemId: string | null = null;
  let pendingPhotoItemId: string | null = null;
  let selectedSaleProductId = "";

  function render(): void {
    if (!container) return;

    const blankItems = ctx.state.inventory.filter(
      (i) => i.category === "Stock Apparel"
    );
    const completedCustomItems = ctx.state.inventory.filter(
      (i) => i.category === "Completed Custom"
    );

    const inStockCount = blankItems.filter(
      (i) => computeStockStatus(i.qty, i.lowStockThreshold || 10) === "In Stock"
    ).length;
    const lowStockCount = blankItems.filter(
      (i) =>
        computeStockStatus(i.qty, i.lowStockThreshold || 10) === "Low Stock"
    ).length;
    const outOfStockCount = blankItems.filter(
      (i) =>
        computeStockStatus(i.qty, i.lowStockThreshold || 10) === "Out of Stock"
    ).length;

    const filteredItems = blankItems.filter((item) => {
      const cond = computeStockStatus(item.qty, item.lowStockThreshold || 10);
      const matchesStatus = stockFilter === "ALL" || cond === stockFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.itemName.toLowerCase().includes(q) ||
        cond.toLowerCase().includes(q) ||
        String(item.unitPrice || 350).includes(q);
      return matchesStatus && matchesSearch;
    });

    if (
      !selectedSaleProductId ||
      !blankItems.some((i) => i.id === selectedSaleProductId)
    ) {
      selectedSaleProductId = blankItems[0]?.id || "";
    }
    const activeSaleProduct =
      blankItems.find((i) => i.id === selectedSaleProductId) || blankItems[0];

    const blankRows =
      filteredItems.length > 0
        ? filteredItems
            .map((item) => {
              const cond = computeStockStatus(
                item.qty,
                item.lowStockThreshold || 10
              );
              const pillClass =
                cond === "Out of Stock"
                  ? "status-out"
                  : cond === "Low Stock"
                  ? "status-low-warn"
                  : "status-available";

              const thumbHtml = item.imageUrl
                ? `<div class="product-thumb-wrap" data-preview-src="${item.imageUrl}" data-preview-title="${item.itemName}" title="Click to view product photo">
                    <img src="${item.imageUrl}" alt="${item.itemName}" />
                  </div>`
                : `<div class="product-thumb-wrap" data-upload-photo-id="${item.id}" title="No image uploaded — click to upload product photo">
                    <span class="product-thumb-placeholder" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
                      </svg>
                    </span>
                  </div>`;

              const priceCellHtml =
                editingPriceItemId === item.id
                  ? `<div class="qty-adjust-group">
                      <input type="number" id="inlinePriceInput_${item.id}" value="${
                      item.unitPrice || 350
                    }" min="1" step="10" style="width:78px;padding:4px 6px;border:1px solid var(--brand-red);border-radius:5px;font-size:0.8rem;" />
                      <button type="button" class="btn btn-red btn-sm" data-save-price-id="${
                        item.id
                      }">Save</button>
                      <button type="button" class="btn btn-light btn-sm" data-cancel-price-id="${
                        item.id
                      }">&times;</button>
                    </div>`
                  : `<div style="display:flex;align-items:center;gap:6px;">
                      <strong>${formatPeso(item.unitPrice || 350, true)}</strong>
                      <button type="button" class="btn btn-light btn-sm" data-edit-price-id="${
                        item.id
                      }" title="Edit Selling Price" style="padding:2px 6px;font-size:0.7rem;">Edit</button>
                    </div>`;

              return `<tr>
                <td>
                  <div class="product-cell">
                    ${thumbHtml}
                    <div>
                      <strong>${item.itemName}</strong><br/>
                      <button type="button" class="breadcrumb-link" data-upload-photo-id="${
                        item.id
                      }" style="font-size:0.7rem;">
                        ${item.imageUrl ? "Change Photo" : "+ Add Photo"}
                      </button>
                    </div>
                  </div>
                </td>
                <td>${priceCellHtml}</td>
                <td><strong>${item.qty} pcs</strong></td>
                <td>
                  <span class="status-pill ${pillClass}">${cond}</span>
                </td>
                <td>
                  <div class="qty-adjust-group">
                    <button type="button" class="qty-btn" data-inv-id="${
                      item.id
                    }" data-delta="-1" title="Deduct 1 pc">-</button>
                    <button type="button" class="qty-btn" data-inv-id="${
                      item.id
                    }" data-delta="1" title="Add 1 pc">+</button>
                    <button type="button" class="btn btn-light btn-sm" data-inv-id="${
                      item.id
                    }" data-delta="10">+10 Restock</button>
                  </div>
                </td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:18px;">${
            blankItems.length === 0
              ? "No finished goods products in inventory yet. Add your first product using the form on the right."
              : "No products match your search or stock filter."
          }</td></tr>`;

    const customRows =
      completedCustomItems.length > 0
        ? completedCustomItems
            .map(
              (item) => `<tr>
            <td><strong>${item.itemName}</strong></td>
            <td>Order #${item.linkedOrderId || "N/A"}</td>
            <td><strong>${item.qty} pcs</strong></td>
            <td><span class="status-pill status-pending">Ready for Pickup</span></td>
            <td>
              <button type="button" class="btn btn-light btn-sm" data-open-release="${
                item.linkedOrderId || ""
              }">
                Go to Order Fulfillment &rarr;
              </button>
            </td>
          </tr>`
            )
            .join("")
        : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:14px;">No custom orders currently waiting for pickup.</td></tr>`;

    const saleProductOptions =
      blankItems.length > 0
        ? blankItems
            .map(
              (i) =>
                `<option value="${i.id}" ${
                  i.id === selectedSaleProductId ? "selected" : ""
                }>${i.itemName} — ${formatPeso(i.unitPrice || 0)}/pc (${
                  i.qty
                } in stock)</option>`
            )
            .join("")
        : `<option value="">No products available — add a product first</option>`;

    const finishedGoodsSales = ctx.state.salesLogbook
      .filter((e) => e.paymentType === "Walk-In Stock Sale")
      .slice(0, 6);

    const recentSalesRows =
      finishedGoodsSales.length > 0
        ? finishedGoodsSales
            .map((e) => {
              const unitP =
                e.unitPrice || Math.round(e.amountPaid / Math.max(1, e.qty));
              return `<tr>
                <td><strong>${e.logNo}</strong></td>
                <td>${e.dateTime}</td>
                <td><strong>${e.particulars}</strong></td>
                <td>${e.clientName}</td>
                <td><strong>${e.qty} pcs</strong></td>
                <td>${formatPeso(unitP, true)}</td>
                <td><strong style="color:var(--green-text);">${formatPeso(
                  e.amountPaid,
                  true
                )}</strong></td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:14px;">No finished goods sales recorded yet.</td></tr>`;

    container.innerHTML = `
      <input type="file" id="invExistingRowPhotoInput" accept="image/jpeg,image/png,image/webp,image/*" hidden />

      <!-- Inventory Summary KPIs -->
      <div class="kpi-strip">
        <div class="kpi-box">
          <span class="kpi-label">Total Finished Products</span>
          <strong class="kpi-val">${blankItems.length}</strong>
          <span class="kpi-meta">Ready-made sportswear items</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">In Stock (&gt;10 pcs)</span>
          <strong class="kpi-val kpi-green">${inStockCount}</strong>
          <span class="kpi-meta">Sufficient available stock</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Low Stock (1–10 pcs)</span>
          <strong class="kpi-val kpi-amber">${lowStockCount}</strong>
          <span class="kpi-meta">Needs restocking soon</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Out of Stock (0 pcs)</span>
          <strong class="kpi-val kpi-red">${outOfStockCount}</strong>
          <span class="kpi-meta">Unavailable — restock required</span>
        </div>
      </div>

      <div class="control-grid-inventory">
        <!-- LEFT: FINISHED GOODS INVENTORY TABLE -->
        <section class="module-card">
          <div class="module-top">
            <h2>Finished Goods Inventory</h2>
            <div class="toolbar-group">
              <input
                type="search"
                id="invSearchInput"
                class="toolbar-input"
                placeholder="Search product name, status, or price..."
                value="${searchQuery}"
              />
              <button type="button" id="invSearchBtn" class="btn btn-red btn-sm" title="Search inventory products">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <span>Search</span>
              </button>
              ${
                searchQuery.trim()
                  ? `<button type="button" id="invClearSearchBtn" class="btn btn-light btn-sm" title="Clear search">Clear</button>`
                  : ""
              }
            </div>
          </div>

          <div class="toolbar-group" style="padding-bottom:4px;">
            <button type="button" class="btn ${
              stockFilter === "ALL" ? "btn-red" : "btn-light"
            } btn-sm" data-stock-filter="ALL">All (${blankItems.length})</button>
            <button type="button" class="btn ${
              stockFilter === "In Stock" ? "btn-red" : "btn-light"
            } btn-sm" data-stock-filter="In Stock">In Stock (${inStockCount})</button>
            <button type="button" class="btn ${
              stockFilter === "Low Stock" ? "btn-red" : "btn-light"
            } btn-sm" data-stock-filter="Low Stock">Low Stock (${lowStockCount})</button>
            <button type="button" class="btn ${
              stockFilter === "Out of Stock" ? "btn-red" : "btn-light"
            } btn-sm" data-stock-filter="Out of Stock">Out of Stock (${outOfStockCount})</button>
          </div>

          <div class="table-scroll">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>Product &amp; Image</th>
                  <th>Selling Price</th>
                  <th>Stock Qty</th>
                  <th>Status</th>
                  <th>Quick Stock Adjust</th>
                </tr>
              </thead>
              <tbody>${blankRows}</tbody>
            </table>
          </div>
        </section>

        <!-- RIGHT: ADD OR RESTOCK PRODUCT -->
        <section class="module-card">
          <div class="module-top">
            <h2>Add or Restock Finished Goods Product</h2>
            <span class="module-tag tag-red">New / Restock</span>
          </div>

          <form id="invAddStockForm" novalidate>
            <div class="field">
              <label for="invNewItemName">Product Name</label>
              <input type="text" id="invNewItemName" placeholder="Enter product name" required />
            </div>

            <div class="form-grid-2">
              <div class="field">
                <label for="invNewItemPrice">Selling Price (\u20B1)</label>
                <input type="number" id="invNewItemPrice" min="1" step="1" placeholder="Enter price" required />
              </div>
              <div class="field">
                <label for="invNewItemQty">Quantity to Add (pcs)</label>
                <input type="number" id="invNewItemQty" min="0" placeholder="Enter quantity" required />
              </div>
            </div>

            <input type="file" id="invProductImageInput" accept="image/jpeg,image/png,image/webp,image/*" hidden />
            <div class="upload-box">
              <div class="upload-box-info">
                ${
                  stagedProductImage
                    ? `<img src="${stagedProductImage}" alt="Product Preview" class="upload-thumb" data-preview-src="${stagedProductImage}" data-preview-title="New Product Image Preview" />`
                    : `<div class="upload-placeholder-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <circle cx="8.5" cy="8.5" r="1.5"></circle>
                          <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                      </div>`
                }
                <div class="upload-meta">
                  <span class="upload-title">Product Image</span>
                  <span class="upload-sub">${
                    stagedProductImage
                      ? stagedProductImageName || "Image ready to save"
                      : "JPG, PNG, or WEBP (Default placeholder if none)"
                  }</span>
                </div>
              </div>
              <div class="upload-actions">
                ${
                  stagedProductImage
                    ? `<button type="button" class="btn btn-light btn-sm" id="invTriggerImageBtn">Replace</button>
                       <button type="button" class="btn btn-danger-outline btn-sm" id="invRemoveImageBtn">Remove</button>`
                    : `<button type="button" class="btn btn-light btn-sm" id="invTriggerImageBtn">+ Upload Product Image</button>`
                }
              </div>
            </div>

            <div class="module-footer-actions">
              <button type="submit" class="btn btn-red" style="width:100%;">
                + Save Product to Inventory
              </button>
            </div>
          </form>
        </section>
      </div>

      <!-- CONSOLIDATED FINISHED GOODS SALE -->
      <section class="module-card">
        <div class="module-top">
          <h2>Record Finished Goods Sale (Consolidated Single-Entry Transaction)</h2>
          <button type="button" class="btn btn-light btn-sm" id="invViewAllSalesBtn">
            Open Full Sales History &rarr;
          </button>
        </div>

        <form id="invQuickSaleForm" novalidate style="padding-bottom:8px;border-bottom:1px solid var(--border-color);">
          <div class="form-grid-5">
            <div class="field">
              <label for="invSaleProductSelect">Select Product</label>
              <select id="invSaleProductSelect" ${
                blankItems.length === 0 ? "disabled" : ""
              }>${saleProductOptions}</select>
            </div>
            <div class="field">
              <label for="invSaleCustomerInput">Customer Name</label>
              <input type="text" id="invSaleCustomerInput" placeholder="Enter customer name" required />
            </div>
            <div class="field">
              <label for="invSaleQtyInput">Quantity Sold (pcs)</label>
              <input type="number" id="invSaleQtyInput" min="1" value="1" ${
                blankItems.length === 0 ? "disabled" : ""
              } required />
            </div>
            <div class="field">
              <label for="invSaleUnitPriceInput">Unit Price (\u20B1)</label>
              <input type="number" id="invSaleUnitPriceInput" value="${
                activeSaleProduct ? activeSaleProduct.unitPrice || 0 : 0
              }" readonly />
            </div>
            <div class="field">
              <label for="invSaleTotalInput">Total Amount (\u20B1)</label>
              <input type="number" id="invSaleTotalInput" value="${
                activeSaleProduct ? activeSaleProduct.unitPrice || 0 : 0
              }" readonly />
            </div>
          </div>
          <div class="module-footer-actions">
            <button type="submit" class="btn btn-red" ${
              blankItems.length === 0 ? "disabled" : ""
            }>
              Confirm Sale &amp; Deduct Stock
            </button>
          </div>
        </form>

        <div class="table-scroll">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Transaction Date</th>
                <th>Product</th>
                <th>Customer</th>
                <th>Quantity Sold</th>
                <th>Unit Price</th>
                <th>Total Amount</th>
              </tr>
            </thead>
            <tbody>${recentSalesRows}</tbody>
          </table>
        </div>
      </section>

      <!-- COMPLETED CUSTOM ORDERS READY FOR PICKUP -->
      <section class="module-card">
        <div class="module-top">
          <h2>Completed Custom Orders Ready for Pickup</h2>
          <span class="module-tag tag-green">${completedCustomItems.length} Ready</span>
        </div>
        <div class="table-scroll">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Custom Order Package</th>
                <th>Order ID</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${customRows}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  container?.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "invSearchInput") {
      searchQuery = (target as HTMLInputElement).value;
      render();
      restoreInputFocus("invSearchInput");
      return;
    }

    if (target.id === "invSaleQtyInput") {
      const qty = Math.max(
        1,
        Number((target as HTMLInputElement).value) || 1
      );
      const unitInput = document.getElementById(
        "invSaleUnitPriceInput"
      ) as HTMLInputElement | null;
      const totalInput = document.getElementById(
        "invSaleTotalInput"
      ) as HTMLInputElement | null;
      const unitPrice = Number(unitInput?.value) || 350;
      if (totalInput) totalInput.value = String(qty * unitPrice);
    }
  });

  container?.addEventListener("change", async (e) => {
    const target = e.target as HTMLElement;

    if (target.id === "invSaleProductSelect") {
      selectedSaleProductId = (target as HTMLSelectElement).value;
      render();
      return;
    }

    if (target.id === "invProductImageInput") {
      const file = (target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        stagedProductImage = await compressImageFile(file, 720, 0.82);
        stagedProductImageName = file.name;
        render();
        ctx.showToast(`Product image "${file.name}" ready.`);
      } catch (err) {
        logError("InventoryModule", "Failed to process new product image.", err);
        ctx.showToast("Please select a valid JPG, PNG, or WEBP image.");
      }
      return;
    }

    if (target.id === "invExistingRowPhotoInput") {
      const file = (target as HTMLInputElement).files?.[0];
      if (!file || !pendingPhotoItemId) return;
      const item = ctx.state.inventory.find((i) => i.id === pendingPhotoItemId);
      pendingPhotoItemId = null;
      if (!item) return;
      try {
        item.imageUrl = await compressImageFile(file, 720, 0.82);
        appendAuditLog(
          ctx.state,
          "Inventory",
          `Updated product image for "${item.itemName}".`,
          { actionType: "inventory_update" }
        );
        ctx.refreshAll();
        ctx.showToast(`Updated image for "${item.itemName}".`);
      } catch (err) {
        logError("InventoryModule", "Failed to update row product photo.", err);
        ctx.showToast("Could not upload product image.");
      }
    }
  });

  container?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    if (
      handleImagePreviewClick(target, ctx.openImagePreview, "Product Image")
    ) {
      return;
    }

    if (target.id === "invTriggerImageBtn") {
      (
        document.getElementById("invProductImageInput") as HTMLInputElement | null
      )?.click();
      return;
    }

    if (target.id === "invRemoveImageBtn") {
      stagedProductImage = undefined;
      stagedProductImageName = undefined;
      render();
      return;
    }

    if (target.id === "invViewAllSalesBtn") {
      ctx.navigateTo("sales-logbook");
      return;
    }

    if (target.closest("#invSearchBtn")) {
      const input = document.getElementById(
        "invSearchInput"
      ) as HTMLInputElement | null;
      searchQuery = input ? input.value : searchQuery;
      render();
      ctx.showToast(
        searchQuery.trim()
          ? `Showing inventory results for "${searchQuery.trim()}".`
          : "Showing all finished goods products."
      );
      return;
    }

    if (target.id === "invClearSearchBtn") {
      searchQuery = "";
      render();
      ctx.showToast("Cleared inventory search.");
      return;
    }

    const uploadRowBtn = target.closest(
      "[data-upload-photo-id]"
    ) as HTMLElement | null;
    if (uploadRowBtn) {
      pendingPhotoItemId = uploadRowBtn.getAttribute("data-upload-photo-id");
      (
        document.getElementById(
          "invExistingRowPhotoInput"
        ) as HTMLInputElement | null
      )?.click();
      return;
    }

    const filterBtn = target.closest(
      "[data-stock-filter]"
    ) as HTMLElement | null;
    if (filterBtn) {
      stockFilter = filterBtn.getAttribute("data-stock-filter") as StockFilter;
      render();
      return;
    }

    const editPriceBtn = target.closest(
      "[data-edit-price-id]"
    ) as HTMLElement | null;
    if (editPriceBtn) {
      editingPriceItemId = editPriceBtn.getAttribute("data-edit-price-id");
      render();
      return;
    }

    if (target.closest("[data-cancel-price-id]")) {
      editingPriceItemId = null;
      render();
      return;
    }

    const savePriceBtn = target.closest(
      "[data-save-price-id]"
    ) as HTMLElement | null;
    if (savePriceBtn) {
      const id = savePriceBtn.getAttribute("data-save-price-id");
      const input = document.getElementById(
        `inlinePriceInput_${id}`
      ) as HTMLInputElement | null;
      const newPrice = Number(input?.value);
      if (!newPrice || newPrice <= 0) {
        ctx.showToast("Please enter a valid positive selling price.");
        return;
      }
      const item = ctx.state.inventory.find((i) => i.id === id);
      if (item) {
        const previousPrice = item.unitPrice || 0;
        item.unitPrice = newPrice;
        editingPriceItemId = null;
        appendAuditLog(
          ctx.state,
          "Inventory",
          `Updated selling price of "${item.itemName}" from ${formatPeso(
            previousPrice,
            true
          )} to ${formatPeso(newPrice, true)}.`,
          { actionType: "price_change" }
        );
        ctx.refreshAll();
        ctx.showToast(
          `Updated price of "${item.itemName}" to ${formatPeso(newPrice, true)}.`
        );
      }
      return;
    }

    const adjBtn = target.closest("[data-inv-id]") as HTMLElement | null;
    if (adjBtn) {
      const invId = adjBtn.getAttribute("data-inv-id");
      const delta = Number(adjBtn.getAttribute("data-delta")) || 0;
      const item = ctx.state.inventory.find((i) => i.id === invId);
      if (!item) return;

      item.qty = Math.max(0, item.qty + delta);
      const threshold = item.lowStockThreshold || 10;
      item.status = computeStockStatus(item.qty, threshold);

      if (item.qty === 0 && delta < 0) {
        pushNotification(ctx.state, {
          title: `Out of Stock Alert — ${item.itemName}`,
          message: `${item.itemName} has 0 pcs left and is now Out of Stock.`,
          category: "Inventory",
          severity: "urgent",
          targetPage: "inventory",
        });
      } else if (item.qty > 0 && item.qty <= threshold && delta < 0) {
        pushNotification(ctx.state, {
          title: `Low Stock Alert — ${item.itemName}`,
          message: `${item.itemName} has ${item.qty} pcs remaining.`,
          category: "Inventory",
          severity: "warning",
          targetPage: "inventory",
        });
      }

      appendAuditLog(
        ctx.state,
        "Inventory",
        `Adjusted ${item.itemName} stock by ${
          delta > 0 ? `+${delta}` : delta
        } pcs (Now: ${item.qty} pcs — ${item.status}).`,
        { actionType: "inventory_update" }
      );
      ctx.refreshAll();
      return;
    }

    const releaseBtn = target.closest(
      "[data-open-release]"
    ) as HTMLElement | null;
    if (releaseBtn) {
      const orderId = releaseBtn.getAttribute("data-open-release") || undefined;
      ctx.navigateTo("workflow", orderId);
    }
  });

  container?.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;

    if (form.id === "invAddStockForm") {
      e.preventDefault();
      const name = (
        document.getElementById("invNewItemName") as HTMLInputElement
      ).value.trim();
      const unitPrice = Number(
        (document.getElementById("invNewItemPrice") as HTMLInputElement).value
      );
      const qty = Number(
        (document.getElementById("invNewItemQty") as HTMLInputElement).value
      );

      if (!name) {
        ctx.showToast("Please enter a product name.");
        return;
      }
      if (Number.isNaN(unitPrice) || unitPrice <= 0) {
        ctx.showToast(
          "Please enter a valid selling price greater than \u20B10."
        );
        return;
      }
      if (Number.isNaN(qty) || qty < 0) {
        ctx.showToast("Quantity cannot be negative.");
        return;
      }

      const existing = ctx.state.inventory.find(
        (i) =>
          i.category === "Stock Apparel" &&
          i.itemName.toLowerCase() === name.toLowerCase()
      );

      if (existing) {
        existing.qty += qty;
        existing.unitPrice = unitPrice;
        if (stagedProductImage) existing.imageUrl = stagedProductImage;
        existing.status = computeStockStatus(
          existing.qty,
          existing.lowStockThreshold || 10
        );
      } else {
        ctx.state.inventory.unshift({
          id: `INV-${Date.now()}`,
          itemName: name,
          category: "Stock Apparel",
          qty,
          unitPrice,
          imageUrl: stagedProductImage,
          lowStockThreshold: 10,
          status: computeStockStatus(qty, 10),
        });
      }

      stagedProductImage = undefined;
      stagedProductImageName = undefined;

      appendAuditLog(
        ctx.state,
        "Inventory",
        `Saved product "${name}" (${qty} pcs @ ${formatPeso(unitPrice, true)}).`,
        { actionType: "inventory_update" }
      );
      ctx.refreshAll();
      ctx.showToast(
        `Saved "${name}" (${qty} pcs at ${formatPeso(unitPrice, true)}/pc).`
      );
      return;
    }

    if (form.id === "invQuickSaleForm") {
      e.preventDefault();
      const prodSelect = document.getElementById(
        "invSaleProductSelect"
      ) as HTMLSelectElement;
      const customerInput = document.getElementById(
        "invSaleCustomerInput"
      ) as HTMLInputElement;
      const qtyInput = document.getElementById(
        "invSaleQtyInput"
      ) as HTMLInputElement;

      const productId = prodSelect?.value;
      const customer = customerInput?.value.trim() || "Walk-In Customer";
      const qtySold = Math.max(1, Number(qtyInput?.value) || 1);

      const stockItem = ctx.state.inventory.find((i) => i.id === productId);
      if (!stockItem) {
        ctx.showToast("Please select a valid product.");
        return;
      }
      if (stockItem.qty <= 0) {
        ctx.showToast(
          `"${stockItem.itemName}" is Out of Stock (0 pcs available).`
        );
        return;
      }
      if (stockItem.qty < qtySold) {
        ctx.showToast(
          `Insufficient stock for "${stockItem.itemName}" (Only ${stockItem.qty} pcs available).`
        );
        return;
      }

      const unitPrice = stockItem.unitPrice || 350;
      const totalAmount = qtySold * unitPrice;

      stockItem.qty -= qtySold;
      stockItem.status = computeStockStatus(
        stockItem.qty,
        stockItem.lowStockThreshold || 10
      );

      const entry = appendLogbookEntry(ctx.state, {
        orderId: "WALK-IN",
        clientName: customer,
        particulars: stockItem.itemName,
        productId: stockItem.id,
        qty: qtySold,
        unitPrice,
        paymentType: "Walk-In Stock Sale" as LogbookPaymentType,
        paymentMethod: "Cash" as PaymentMethod,
        amountPaid: totalAmount,
        balanceRemaining: 0,
        remarks: `${qtySold} pcs × ${formatPeso(unitPrice)} (${stockItem.status})`,
      });

      const lowThreshold = stockItem.lowStockThreshold || 10;
      if (stockItem.qty === 0) {
        pushNotification(ctx.state, {
          title: `Out of Stock — ${stockItem.itemName}`,
          message: `${stockItem.itemName} reached 0 pcs after selling ${qtySold} pcs (${entry.logNo}).`,
          category: "Inventory",
          severity: "urgent",
          targetPage: "inventory",
        });
      } else if (stockItem.qty <= lowThreshold) {
        pushNotification(ctx.state, {
          title: `Low Stock Alert — ${stockItem.itemName}`,
          message: `${stockItem.itemName} has ${stockItem.qty} pcs remaining after ${entry.logNo}.`,
          category: "Inventory",
          severity: "warning",
          targetPage: "inventory",
        });
      }

      appendAuditLog(
        ctx.state,
        "Sales",
        `Sold ${qtySold} pcs of "${stockItem.itemName}" (${formatPeso(
          unitPrice
        )}/pc = ${formatPeso(totalAmount, true)}) in ${entry.logNo}.`,
        { actionType: "payment" }
      );
      ctx.refreshAll();
      ctx.showToast(
        `Recorded consolidated sale ${entry.logNo}: ${qtySold} pcs of ${
          stockItem.itemName
        } (${formatPeso(totalAmount, true)}).`
      );
    }
  });

  return { render };
}
