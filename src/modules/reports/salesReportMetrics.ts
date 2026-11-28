// ============================================================================
// JM MAKER SPORTSWEAR — SALES REPORT METRICS & PRINT BUILDER
// Pure aggregation helpers separated from the Sales Reports UI controller so
// calculations are easy to inspect, study, and unit-test independently.
// ============================================================================

import type { SalesLogbookEntry } from "../../types/system.types";
import { computeSalesRevenueBreakdown } from "../../utils/calculations";
import { formatPeso } from "../../utils/formatters";

export interface ProductSalesAgg {
  productName: string;
  categoryLabel: string;
  qtySold: number;
  revenue: number;
  transactions: number;
}

export interface MonthlySeriesPoint {
  monthKey: string;
  monthShort: string;
  monthFull: string;
  revenue: number;
  unitsSold: number;
  transactions: number;
}

const MONTH_NAMES = [
  { num: "01", short: "Jan", full: "January" },
  { num: "02", short: "Feb", full: "February" },
  { num: "03", short: "Mar", full: "March" },
  { num: "04", short: "Apr", full: "April" },
  { num: "05", short: "May", full: "May" },
  { num: "06", short: "Jun", full: "June" },
  { num: "07", short: "Jul", full: "July" },
  { num: "08", short: "Aug", full: "August" },
  { num: "09", short: "Sep", full: "September" },
  { num: "10", short: "Oct", full: "October" },
  { num: "11", short: "Nov", full: "November" },
  { num: "12", short: "Dec", full: "December" },
];

export function buildYearMonths(year: number): Array<{
  key: string;
  short: string;
  full: string;
}> {
  return MONTH_NAMES.map((m) => ({
    key: `${year}-${m.num}`,
    short: m.short,
    full: `${m.full} ${year}`,
  }));
}

export function normalizeProductName(particulars: string): string {
  const idx = particulars.indexOf("(");
  if (idx > 0 && particulars.includes(":")) {
    return particulars.slice(0, idx).trim();
  }
  return particulars.trim();
}

export function aggregateProductSales(
  entries: SalesLogbookEntry[]
): ProductSalesAgg[] {
  const map = new Map<string, ProductSalesAgg>();
  entries.forEach((e) => {
    const name = normalizeProductName(e.particulars || "Custom Sportswear");
    const isStock =
      e.paymentType === "Walk-In Stock Sale" || e.orderId === "STOCK";
    const cur = map.get(name) || {
      productName: name,
      categoryLabel: isStock ? "Finished Goods Stock" : "Custom Team Order",
      qtySold: 0,
      revenue: 0,
      transactions: 0,
    };
    cur.qtySold += Number(e.qty) || 0;
    cur.revenue += Number(e.amountPaid) || 0;
    cur.transactions += 1;
    map.set(name, cur);
  });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export function buildMonthlySeries(
  entries: SalesLogbookEntry[],
  year: number
): MonthlySeriesPoint[] {
  return buildYearMonths(year).map((m) => {
    const monthEntries = entries.filter(
      (e) => (e.isoDate || "").slice(0, 7) === m.key
    );
    const revenue = monthEntries.reduce(
      (sum, e) => sum + (Number(e.amountPaid) || 0),
      0
    );
    const unitsSold = monthEntries.reduce(
      (sum, e) => sum + (Number(e.qty) || 0),
      0
    );
    return {
      monthKey: m.key,
      monthShort: m.short,
      monthFull: m.full,
      revenue,
      unitsSold,
      transactions: monthEntries.length,
    };
  });
}

export function buildSalesCsvContent(entries: SalesLogbookEntry[]): string {
  const esc = (val: string | number | undefined): string => {
    const str = String(val ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = [
    "Log No",
    "OR Number",
    "Date",
    "Order Ref",
    "Customer / Team",
    "Particulars",
    "Qty",
    "Unit Price (PHP)",
    "Payment Type",
    "Payment Method",
    "Reference Number",
    "Amount Paid (PHP)",
    "Balance Remaining (PHP)",
    "Remarks",
  ].join(",");

  const rows = entries.map((e) =>
    [
      e.logNo,
      e.orNumber,
      e.isoDate,
      e.orderId,
      e.clientName,
      e.particulars,
      e.qty,
      e.unitPrice ?? 0,
      e.paymentType,
      e.paymentMethod || "Cash",
      e.referenceNumber || "",
      e.amountPaid,
      e.balanceRemaining,
      e.remarks,
    ]
      .map(esc)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

export function buildPrintableSalesReportHtml(
  entries: SalesLogbookEntry[]
): string {
  const revBreakdown = computeSalesRevenueBreakdown(entries);
  const productBreakdown = aggregateProductSales(entries);

  const prodRows = productBreakdown
    .map(
      (p) => `<tr>
        <td>${p.productName}</td>
        <td>${p.categoryLabel}</td>
        <td>${p.transactions}</td>
        <td>${p.qtySold} pcs</td>
        <td>${formatPeso(p.revenue, true)}</td>
      </tr>`
    )
    .join("");

  const logRows = entries
    .map(
      (e) => `<tr>
        <td>${e.logNo} (${e.orNumber})</td>
        <td>${e.isoDate}</td>
        <td>${e.clientName}</td>
        <td>${e.particulars}</td>
        <td>${e.qty} pcs</td>
        <td>${e.paymentMethod || "Cash"}</td>
        <td>${formatPeso(e.amountPaid, true)}</td>
      </tr>`
    )
    .join("");

  return `
    <div class="print-box">
      <div class="print-header">
        <h2>JM MAKER SPORTSWEAR — SALES REVENUE &amp; LOGBOOK REPORT</h2>
        <p>Generated: ${new Date().toLocaleString()}</p>
      </div>
      <p>
        <strong>Total Recorded Sales Revenue:</strong> ${formatPeso(
          revBreakdown.totalRevenue,
          true
        )}
        (Custom Orders: ${formatPeso(
          revBreakdown.customOrdersRevenue,
          true
        )} | Finished Goods Stock: ${formatPeso(
    revBreakdown.stockSalesRevenue,
    true
  )})
      </p>
      <h3 style="margin-top:14px;">Itemized Sales Logbook</h3>
      <table class="print-table">
        <thead>
          <tr>
            <th>Log / OR No.</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Particulars</th>
            <th>Qty</th>
            <th>Method</th>
            <th>Amount Paid</th>
          </tr>
        </thead>
        <tbody>${logRows}</tbody>
      </table>
      <h3 style="margin-top:14px;">Product Sales Breakdown</h3>
      <table class="print-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th>Transactions</th>
            <th>Quantity Sold</th>
            <th>Total Revenue</th>
          </tr>
        </thead>
        <tbody>${prodRows}</tbody>
      </table>
    </div>
  `;
}
