// ============================================================================
// JM MAKER SPORTSWEAR — STAFF MONITORING METRICS & PRINT REPORT BUILDER
// Pure computation helpers for per-staff task completion rates, activity
// counts, permission badges, and printable accountability reports.
// ============================================================================

import type {
  AuditActionType,
  AuditLogEntry,
  StaffMember,
  StaffPermissions,
  StaffTask,
} from "../../types/system.types";

export interface StaffPerformanceRow {
  staff: StaffMember;
  totalTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  completionRatePct: number;
  loggedActionsCount: number;
  lastActivityTime: string;
}

export function computeStaffPerformance(
  staffMembers: StaffMember[],
  staffTasks: StaffTask[],
  auditLogs: AuditLogEntry[]
): StaffPerformanceRow[] {
  return staffMembers.map((staff) => {
    const tasks = staffTasks.filter((t) => t.staffMemberId === staff.id);
    const pendingTasks = tasks.filter((t) => t.status === "Pending").length;
    const inProgressTasks = tasks.filter((t) => t.status === "In Progress").length;
    const completedTasks = tasks.filter((t) => t.status === "Completed").length;
    const activeTotal = tasks.filter((t) => t.status !== "Cancelled").length;
    const completionRatePct =
      activeTotal > 0 ? Math.round((completedTasks / activeTotal) * 100) : 0;

    const actorLogs = auditLogs.filter(
      (a) =>
        a.staffMemberId === staff.id ||
        (a.actorName &&
          a.actorName.trim().toLowerCase() === staff.fullName.trim().toLowerCase())
    );

    return {
      staff,
      totalTasks: tasks.length,
      pendingTasks,
      inProgressTasks,
      completedTasks,
      completionRatePct,
      loggedActionsCount: actorLogs.length,
      lastActivityTime: actorLogs[0]?.timestamp || staff.lastLoginAt || "No activity yet",
    };
  });
}

export function formatPermissionLabels(perms: StaffPermissions): string[] {
  const labels: string[] = [];
  if (perms.canManagePOS) labels.push("POS");
  if (perms.canManageOrders) labels.push("Orders");
  if (perms.canManageInventory) labels.push("Inventory");
  if (perms.canVerifyPayments) labels.push("Payments");
  if (perms.canViewReports) labels.push("Reports");
  return labels;
}

export function formatActionTypeLabel(type?: AuditActionType): string {
  switch (type) {
    case "login":
      return "User Login";
    case "logout":
      return "User Logout";
    case "order_update":
      return "Order Update";
    case "task_update":
      return "Task Update";
    case "inventory_update":
      return "Inventory Update";
    case "price_change":
      return "Price Change";
    case "payment":
      return "Payment / Sales";
    case "backup":
      return "Backup & Restore";
    case "staff_admin":
      return "Staff & Access";
    default:
      return "System Activity";
  }
}

export function generateNextStaffCode(existing: StaffMember[]): string {
  const used = new Set(
    existing
      .map((s) => Number.parseInt(s.staffCode.replace(/\D/g, ""), 10))
      .filter((n) => !Number.isNaN(n))
  );
  let next = used.size > 0 ? Math.max(...used) + 1 : 1;
  while (used.has(next)) next += 1;
  return `STF-${String(next).padStart(3, "0")}`;
}

export function generateNextTaskCode(existing: StaffTask[]): string {
  const year = new Date().getFullYear();
  const used = new Set(
    existing
      .map((t) => {
        const parts = t.taskCode.split("-");
        return Number.parseInt(parts[parts.length - 1] || "", 10);
      })
      .filter((n) => !Number.isNaN(n))
  );
  let next = used.size > 0 ? Math.max(...used) + 1 : 1;
  while (used.has(next)) next += 1;
  return `TSK-${year}-${String(next).padStart(3, "0")}`;
}

export function buildPrintableStaffMonitoringReportHtml(
  perfRows: StaffPerformanceRow[],
  tasks: StaffTask[],
  auditLogs: AuditLogEntry[]
): string {
  const staffTableRows =
    perfRows.length > 0
      ? perfRows
          .map(
            (r) => `<tr>
              <td><strong>${r.staff.staffCode}</strong></td>
              <td>${r.staff.fullName}</td>
              <td>${r.staff.positionTitle} (${r.staff.roleLevel})</td>
              <td>${r.staff.availabilityStatus} / ${r.staff.accountStatus}</td>
              <td>${r.completedTasks} / ${r.totalTasks} (${r.completionRatePct}%)</td>
              <td>${r.loggedActionsCount}</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="6">No staff members registered yet.</td></tr>`;

  const taskRows =
    tasks.length > 0
      ? tasks
          .slice(0, 25)
          .map(
            (t) => `<tr>
              <td>${t.taskCode}</td>
              <td>${t.title}</td>
              <td>${t.taskType}</td>
              <td>${t.priority}</td>
              <td>${t.status}</td>
              <td>${t.completedAt || t.dueDate || "—"}</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="6">No staff tasks assigned yet.</td></tr>`;

  const logRows =
    auditLogs.length > 0
      ? auditLogs
          .slice(0, 30)
          .map(
            (a) => `<tr>
              <td>${a.timestamp}</td>
              <td>${a.actorName || "JM Maker Owner/Manager"}</td>
              <td>${formatActionTypeLabel(a.actionType)}</td>
              <td>${a.module}</td>
              <td>${a.action}</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="5">No audit trail activity recorded yet.</td></tr>`;

  return `
    <div class="print-box">
      <div class="print-header">
        <h2>JM MAKER SPORTSWEAR — STAFF MONITORING &amp; AUDIT TRAIL REPORT</h2>
        <p>Generated: ${new Date().toLocaleString()}</p>
      </div>
      <h3>1. Staff Directory &amp; Task Accomplishments</h3>
      <table class="print-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Staff Member</th>
            <th>Position / Role</th>
            <th>Status</th>
            <th>Tasks Completed</th>
            <th>Logged Actions</th>
          </tr>
        </thead>
        <tbody>${staffTableRows}</tbody>
      </table>
      <h3 style="margin-top:14px;">2. Assigned Tasks &amp; Completion Tracking</h3>
      <table class="print-table">
        <thead>
          <tr>
            <th>Task Code</th>
            <th>Title</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Due / Completed</th>
          </tr>
        </thead>
        <tbody>${taskRows}</tbody>
      </table>
      <h3 style="margin-top:14px;">3. Immutable Activity &amp; Login Audit Trail (Latest 30)</h3>
      <table class="print-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>User / Actor</th>
            <th>Event Type</th>
            <th>Module</th>
            <th>Action Details</th>
          </tr>
        </thead>
        <tbody>${logRows}</tbody>
      </table>
    </div>
  `;
}
