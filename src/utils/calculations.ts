// ============================================================================
// JM MAKER SPORTSWEAR — BUSINESS CALCULATIONS
// Pure domain calculation functions for inventory status, custom order totals,
// and sales revenue breakdowns.
// ============================================================================

import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  XXL_SURCHARGE_PER_PIECE,
} from "../config/constants";
import type {
  SalesLogbookEntry,
  SalesRevenueBreakdown,
  SizeBreakdown,
  SystemState,
} from "../types/system.types";

/**
 * Evaluates stock status for Finished Goods Inventory:
 * - Out of Stock: qty <= 0
 * - Low Stock: 0 < qty <= threshold (default 10)
 * - In Stock: qty > threshold
 */
export function computeStockStatus(
  qty: number,
  threshold = DEFAULT_LOW_STOCK_THRESHOLD
): "In Stock" | "Low Stock" | "Out of Stock" {
  const safeQty = Number(qty) || 0;
  if (safeQty <= 0) return "Out of Stock";
  if (safeQty <= threshold) return "Low Stock";
  return "In Stock";
}

/**
 * Computes total piece quantity and total amount for a custom order,
 * including the per-piece XXL+ surcharge.
 */
export function computeOrderTotals(
  sizes: SizeBreakdown,
  unitPrice: number
): { totalQty: number; totalAmount: number } {
  const totalQty =
    (Number(sizes.XS) || 0) +
    (Number(sizes.S) || 0) +
    (Number(sizes.M) || 0) +
    (Number(sizes.L) || 0) +
    (Number(sizes.XL) || 0) +
    (Number(sizes.XXL) || 0);

  const xxlSurcharge = (Number(sizes.XXL) || 0) * XXL_SURCHARGE_PER_PIECE;
  const totalAmount = totalQty * unitPrice + xxlSurcharge;
  return { totalQty, totalAmount };
}

/**
 * Aggregates recorded Sales Logbook entries into transparent source
 * (Custom Team Orders vs. Stock Sales) and payment method totals.
 */
export function computeSalesRevenueBreakdown(
  entries: SalesLogbookEntry[]
): SalesRevenueBreakdown {
  let totalRevenue = 0;
  let totalUnitsSold = 0;
  let customOrdersRevenue = 0;
  let customOrdersTxns = 0;
  let customOrdersUnits = 0;
  let stockSalesRevenue = 0;
  let stockSalesTxns = 0;
  let stockSalesUnits = 0;
  let cashTotal = 0;
  let gcashTotal = 0;
  let bankTotal = 0;

  entries.forEach((entry) => {
    const amount = Number(entry.amountPaid) || 0;
    const qty = Number(entry.qty) || 0;
    totalRevenue += amount;
    totalUnitsSold += qty;

    if (
      entry.paymentType === "Walk-In Stock Sale" ||
      entry.orderId === "STOCK"
    ) {
      stockSalesRevenue += amount;
      stockSalesTxns += 1;
      stockSalesUnits += qty;
    } else {
      customOrdersRevenue += amount;
      customOrdersTxns += 1;
      customOrdersUnits += qty;
    }

    const method = entry.paymentMethod || "Cash";
    if (method === "GCash") gcashTotal += amount;
    else if (method === "Bank Transfer") bankTotal += amount;
    else cashTotal += amount;
  });

  return {
    totalRevenue,
    totalUnitsSold,
    totalTransactions: entries.length,
    customOrdersRevenue,
    customOrdersTxns,
    customOrdersUnits,
    stockSalesRevenue,
    stockSalesTxns,
    stockSalesUnits,
    cashTotal,
    gcashTotal,
    bankTotal,
  };
}

/** Returns exact sum of all recorded sales transactions in the system state. */
export function computeMonthlyRevenue(state: SystemState): number {
  return state.salesLogbook.reduce(
    (sum, entry) => sum + (Number(entry.amountPaid) || 0),
    0
  );
}
