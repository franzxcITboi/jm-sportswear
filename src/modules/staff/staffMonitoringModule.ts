// ============================================================================
// JM MAKER SPORTSWEAR — STAFF MONITORING & ACCOUNTABILITY MODULE
// Fulfills Capstone Paper Objective 4 & Interview Q17–Q18:
//   1. Staff Directory, Availability Status & Role-Based Permissions (RBAC)
//   2. Operational Task Assignments & Completion Tracking (linked to Orders/Stock)
//   3. Immutable Activity & Login Audit Trail (searchable, filterable, printable)
// ============================================================================

import { getOwnerSession, isOwnerManager } from "../../services/authService";
import { appendAuditLog, pushNotification } from "../../store/systemStore";
import type {
  AuditActionType,
  StaffAvailabilityStatus,
  StaffMember,
  StaffRoleLevel,
  StaffTask,
  StaffTaskPriority,
  StaffTaskStatus,
  StaffTaskType,
} from "../../types/system.types";
import { restoreInputFocus } from "../../utils/dom";
import { formatLogbookDateNow, formatTimeNow } from "../../utils/formatters";
import type { ModuleContext } from "../moduleTypes";
import {
  buildPrintableStaffMonitoringReportHtml,
  computeStaffPerformance,
  formatActionTypeLabel,
  formatPermissionLabels,
  generateNextStaffCode,
  generateNextTaskCode,
} from "./staffMonitoringMetrics";

type StaffTabMode = "DIRECTORY" | "TASKS" | "AUDIT";
type StaffSortMode = "NAME_ASC" | "COMPLETED_DESC" | "ACTIVITY_DESC";

export function initStaffMonitoringModule(ctx: ModuleContext): {
  render: () => void;
} {
  const container = document.getElementById("staffMonitoringPageContent");

  let activeTab: StaffTabMode = "DIRECTORY";
  let editingStaffId: string | null = null;

  // Directory filters
  let staffSearch = "";
  let availabilityFilter: "ALL" | StaffAvailabilityStatus = "ALL";
  let sortMode: StaffSortMode = "NAME_ASC";

  // Task filters
  let taskSearch = "";
  let taskStatusFilter: "ALL" | StaffTaskStatus = "ALL";
  let taskStaffFilter = "ALL";

  // Audit filters
  let auditSearch = "";
  let auditTypeFilter: "ALL" | AuditActionType = "ALL";
  let auditActorFilter = "ALL";

  function render(): void {
    if (!container) return;

    const session = getOwnerSession();
    const canAdminStaff = isOwnerManager(session);

    const staffMembers = ctx.state.staffMembers || [];
    const staffTasks = ctx.state.staffTasks || [];
    const auditLogs = ctx.state.auditLogs || [];
    const perfRows = computeStaffPerformance(staffMembers, staffTasks, auditLogs);

    const activeStaffCount = staffMembers.filter(
      (s) => s.accountStatus === "Active"
    ).length;
    const onDutyCount = staffMembers.filter(
      (s) => s.accountStatus === "Active" && s.availabilityStatus === "On Duty"
    ).length;
    const openTasksCount = staffTasks.filter(
      (t) => t.status === "Pending" || t.status === "In Progress"
    ).length;
    const completedTasksCount = staffTasks.filter(
      (t) => t.status === "Completed"
    ).length;
    const nonCancelledTasks = staffTasks.filter(
      (t) => t.status !== "Cancelled"
    ).length;
    const overallCompletionPct =
      nonCancelledTasks > 0
        ? Math.round((completedTasksCount / nonCancelledTasks) * 100)
        : 0;
    const loginEventsCount = auditLogs.filter(
      (a) => a.actionType === "login" || a.actionType === "logout"
    ).length;
    const stockPriceEventsCount = auditLogs.filter(
      (a) => a.actionType === "inventory_update" || a.actionType === "price_change"
    ).length;

    const subnavHtml = `
      <div class="subnav-bar">
        <div class="subnav-tabs">
          <button type="button" class="subnav-btn ${
            activeTab === "DIRECTORY" ? "active" : ""
          }" data-staff-tab="DIRECTORY">
            Staff Directory &amp; Permissions (${staffMembers.length})
          </button>
          <button type="button" class="subnav-btn ${
            activeTab === "TASKS" ? "active" : ""
          }" data-staff-tab="TASKS">
            Task Assignments &amp; Tracking (${staffTasks.length})
          </button>
          <button type="button" class="subnav-btn ${
            activeTab === "AUDIT" ? "active" : ""
          }" data-staff-tab="AUDIT">
            Immutable Activity &amp; Login Trail (${auditLogs.length})
          </button>
        </div>
        <div class="toolbar-group">
          <button type="button" id="staffPrintReportBtn" class="btn btn-red btn-sm">
            Print Staff Monitoring Report
          </button>
        </div>
      </div>
    `;

    const kpiHtml = `
      <div class="kpi-strip">
        <div class="kpi-box">
          <span class="kpi-label">Active Staff Members</span>
          <strong class="kpi-val">${activeStaffCount}</strong>
          <span class="kpi-meta">${onDutyCount} On Duty &bull; ${staffMembers.length} total profile(s)</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Active Assigned Tasks</span>
          <strong class="kpi-val ${openTasksCount > 0 ? "kpi-amber" : ""}">${openTasksCount}</strong>
          <span class="kpi-meta">${staffTasks.filter((t) => t.status === "Pending").length} Pending &bull; ${staffTasks.filter((t) => t.status === "In Progress").length} In Progress</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Task Completion Rate</span>
          <strong class="kpi-val kpi-green">${overallCompletionPct}%</strong>
          <span class="kpi-meta">${completedTasksCount} of ${nonCancelledTasks} active task(s) completed</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Immutable Audit Entries</span>
          <strong class="kpi-val">${auditLogs.length}</strong>
          <span class="kpi-meta">${loginEventsCount} login/logout &bull; ${stockPriceEventsCount} stock/price logs</span>
        </div>
      </div>
    `;

    let bodyHtml = "";

    // ================= TAB 1: STAFF DIRECTORY & RBAC PERMISSIONS =================
    if (activeTab === "DIRECTORY") {
      const editTarget = editingStaffId
        ? staffMembers.find((s) => s.id === editingStaffId) || null
        : null;

      const q = staffSearch.trim().toLowerCase();
      const filteredPerf = perfRows
        .filter((row) => {
          const matchesAvail =
            availabilityFilter === "ALL" ||
            row.staff.availabilityStatus === availabilityFilter;
          const matchesQuery =
            !q ||
            row.staff.fullName.toLowerCase().includes(q) ||
            row.staff.staffCode.toLowerCase().includes(q) ||
            row.staff.positionTitle.toLowerCase().includes(q) ||
            (row.staff.email || "").toLowerCase().includes(q);
          return matchesAvail && matchesQuery;
        })
        .sort((a, b) => {
          if (sortMode === "COMPLETED_DESC") {
            return b.completedTasks - a.completedTasks;
          }
          if (sortMode === "ACTIVITY_DESC") {
            return b.loggedActionsCount - a.loggedActionsCount;
          }
          return a.staff.fullName.localeCompare(b.staff.fullName);
        });

      const rosterRowsHtml =
        filteredPerf.length > 0
          ? filteredPerf
              .map(({ staff, totalTasks, completedTasks, completionRatePct, loggedActionsCount, lastActivityTime }) => {
                const permBadges = formatPermissionLabels(staff.permissions)
                  .map(
                    (label) =>
                      `<span class="module-tag tag-blue" style="font-size:0.66rem;padding:1px 6px;">${label}</span>`
                  )
                  .join(" ");

                const availCls =
                  staff.availabilityStatus === "On Duty"
                    ? "status-available"
                    : staff.availabilityStatus === "On Leave"
                    ? "status-out"
                    : "status-pending";

                const accCls =
                  staff.accountStatus === "Active"
                    ? "status-available"
                    : "status-out";

                return `<tr>
                  <td>
                    <strong>${staff.fullName}</strong><br/>
                    <small style="color:var(--text-muted);">${staff.staffCode}${
                  staff.email ? ` &bull; ${staff.email}` : ""
                }</small>
                  </td>
                  <td>
                    <strong>${staff.positionTitle}</strong><br/>
                    <small style="color:var(--text-muted);">${staff.shiftSchedule}${
                  staff.contactNumber ? ` &bull; ${staff.contactNumber}` : ""
                }</small>
                  </td>
                  <td>
                    <span class="status-pill ${availCls}">${staff.availabilityStatus}</span><br/>
                    ${
                      canAdminStaff
                        ? `<div class="qty-adjust-group" style="margin-top:4px;">
                            <button type="button" class="qty-btn" data-staff-avail="${staff.id}" data-avail-val="On Duty" title="Set On Duty">On</button>
                            <button type="button" class="qty-btn" data-staff-avail="${staff.id}" data-avail-val="Off Duty" title="Set Off Duty">Off</button>
                            <button type="button" class="qty-btn" data-staff-avail="${staff.id}" data-avail-val="On Leave" title="Set On Leave">Leave</button>
                          </div>`
                        : ""
                    }
                  </td>
                  <td>
                    <span class="module-tag tag-red" style="font-size:0.66rem;padding:1px 6px;margin-bottom:4px;display:inline-block;">${
                      staff.roleLevel === "supervisor" ? "Supervisor" : "Staff"
                    }</span><br/>
                    <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;">${
                      permBadges || `<small style="color:var(--text-muted);">View Only</small>`
                    }</div>
                  </td>
                  <td>
                    <strong>${completedTasks} / ${totalTasks} tasks</strong> (${completionRatePct}%)<br/>
                    <small style="color:var(--text-muted);">${loggedActionsCount} logged action(s) &bull; Last: ${lastActivityTime}</small>
                  </td>
                  <td><span class="status-pill ${accCls}">${staff.accountStatus}</span></td>
                  <td>
                    ${
                      canAdminStaff
                        ? `<div style="display:flex;gap:4px;flex-wrap:wrap;">
                            <button type="button" class="btn btn-light btn-sm" data-staff-edit="${staff.id}">Edit</button>
                            <button type="button" class="btn btn-light btn-sm" data-staff-toggle-status="${staff.id}">${
                            staff.accountStatus === "Active"
                              ? "Deactivate"
                              : "Activate"
                          }</button>
                            <button type="button" class="btn btn-danger-outline btn-sm" data-staff-delete="${staff.id}">Remove</button>
                          </div>`
                        : `<small style="color:var(--text-muted);">Owner Managed</small>`
                    }
                  </td>
                </tr>`;
              })
              .join("")
          : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px;">${
              staffMembers.length === 0
                ? "No staff members added yet. Use the form above to register shop personnel, set schedules, and assign module access permissions."
                : "No staff records match your current search or filter."
            }</td></tr>`;

      const staffFormHtml = canAdminStaff
        ? `<section class="module-card">
            <div class="module-top">
              <div>
                <h2>${
                  editTarget
                    ? `Edit Staff Profile &amp; Permissions — ${editTarget.staffCode}`
                    : "Register Staff Member &amp; Set Access Permissions"
                }</h2>
                <p class="module-subtitle">
                  Maintain staff records, shift schedules, availability, and role-based module permissions (Objective 4).
                </p>
              </div>
              ${
                editTarget
                  ? `<button type="button" id="staffCancelEditBtn" class="btn btn-light btn-sm">Cancel Edit</button>`
                  : `<span class="module-tag tag-red">Owner/Manager Only</span>`
              }
            </div>
            <form id="staffMemberForm" novalidate>
              <div class="form-grid-4">
                <div class="field">
                  <label for="stfFullName">Full Name *</label>
                  <input type="text" id="stfFullName" value="${
                    editTarget ? editTarget.fullName : ""
                  }" placeholder="e.g., Carlo Mendoza" required />
                </div>
                <div class="field">
                  <label for="stfPosition">Position / Responsibility *</label>
                  <input type="text" id="stfPosition" value="${
                    editTarget ? editTarget.positionTitle : ""
                  }" placeholder="e.g., Sublimation Artist" required />
                </div>
                <div class="field">
                  <label for="stfRoleLevel">Account Role Level</label>
                  <select id="stfRoleLevel">
                    <option value="staff" ${
                      !editTarget || editTarget.roleLevel === "staff"
                        ? "selected"
                        : ""
                    }>Shop Staff (Scoped Permissions)</option>
                    <option value="supervisor" ${
                      editTarget?.roleLevel === "supervisor" ? "selected" : ""
                    }>Supervisor (Can View Staff Monitoring)</option>
                  </select>
                </div>
                <div class="field">
                  <label for="stfAvailability">Availability / Duty Status</label>
                  <select id="stfAvailability">
                    <option value="On Duty" ${
                      !editTarget || editTarget.availabilityStatus === "On Duty"
                        ? "selected"
                        : ""
                    }>On Duty</option>
                    <option value="Off Duty" ${
                      editTarget?.availabilityStatus === "Off Duty"
                        ? "selected"
                        : ""
                    }>Off Duty</option>
                    <option value="On Leave" ${
                      editTarget?.availabilityStatus === "On Leave"
                        ? "selected"
                        : ""
                    }>On Leave</option>
                  </select>
                </div>
              </div>

              <div class="form-grid-4">
                <div class="field">
                  <label for="stfContact">Contact Number</label>
                  <input type="text" id="stfContact" value="${
                    editTarget ? editTarget.contactNumber : ""
                  }" placeholder="e.g., 0917-123-4567" />
                </div>
                <div class="field">
                  <label for="stfShift">Shift Schedule</label>
                  <input type="text" id="stfShift" value="${
                    editTarget
                      ? editTarget.shiftSchedule
                      : "Mon–Sat 8:00 AM – 5:00 PM"
                  }" placeholder="e.g., Mon–Sat 8:00 AM – 5:00 PM" />
                </div>
                <div class="field">
                  <label for="stfEmail">Login Email (Optional)</label>
                  <input type="email" id="stfEmail" value="${
                    editTarget?.email || ""
                  }" placeholder="staff@jmmaker.ph" />
                </div>
                <div class="field">
                  <label for="stfPassword">Local Sign-In Password (Optional)</label>
                  <input type="password" id="stfPassword" value="${
                    editTarget?.loginPassword || ""
                  }" placeholder="Min. 6 chars (if staff logs in)" />
                </div>
              </div>

              <div class="size-matrix-box">
                <span class="matrix-title">Module Access Permissions (RBAC)</span>
                <div style="display:flex;flex-wrap:wrap;gap:14px;">
                  <label class="verify-checkbox-label">
                    <input type="checkbox" id="permPosChk" ${
                      editTarget
                        ? editTarget.permissions.canManagePOS
                          ? "checked"
                          : ""
                        : "checked"
                    } />
                    Custom Orders &amp; POS
                  </label>
                  <label class="verify-checkbox-label">
                    <input type="checkbox" id="permOrdersChk" ${
                      editTarget
                        ? editTarget.permissions.canManageOrders
                          ? "checked"
                          : ""
                        : "checked"
                    } />
                    Order Fulfillment
                  </label>
                  <label class="verify-checkbox-label">
                    <input type="checkbox" id="permInvChk" ${
                      editTarget
                        ? editTarget.permissions.canManageInventory
                          ? "checked"
                          : ""
                        : "checked"
                    } />
                    Finished Goods Inventory
                  </label>
                  <label class="verify-checkbox-label">
                    <input type="checkbox" id="permPayChk" ${
                      editTarget?.permissions.canVerifyPayments ? "checked" : ""
                    } />
                    Payment Verification
                  </label>
                  <label class="verify-checkbox-label">
                    <input type="checkbox" id="permRepChk" ${
                      editTarget?.permissions.canViewReports ? "checked" : ""
                    } />
                    Sales History &amp; Reports
                  </label>
                </div>
              </div>

              <div class="module-footer-actions">
                <button type="submit" class="btn btn-red">
                  ${editTarget ? "Save Staff Changes" : "+ Add Staff Member"}
                </button>
              </div>
            </form>
          </section>`
        : "";

      bodyHtml = `
        ${staffFormHtml}
        <section class="module-card">
          <div class="module-top">
            <div>
              <h2>Staff Directory, Availability &amp; Performance Summary</h2>
              <p class="module-subtitle">Monitor shop personnel, duty availability, RBAC module access, and task completion metrics.</p>
            </div>
            <div class="toolbar-group">
              <input type="search" id="staffSearchInput" class="toolbar-input" placeholder="Search staff name, code, position..." value="${staffSearch}" />
              <select id="staffAvailFilter" class="toolbar-select">
                <option value="ALL" ${availabilityFilter === "ALL" ? "selected" : ""}>All Availability</option>
                <option value="On Duty" ${availabilityFilter === "On Duty" ? "selected" : ""}>On Duty</option>
                <option value="Off Duty" ${availabilityFilter === "Off Duty" ? "selected" : ""}>Off Duty</option>
                <option value="On Leave" ${availabilityFilter === "On Leave" ? "selected" : ""}>On Leave</option>
              </select>
              <select id="staffSortSelect" class="toolbar-select">
                <option value="NAME_ASC" ${sortMode === "NAME_ASC" ? "selected" : ""}>Sort: Name (A–Z)</option>
                <option value="COMPLETED_DESC" ${sortMode === "COMPLETED_DESC" ? "selected" : ""}>Sort: Most Tasks Completed</option>
                <option value="ACTIVITY_DESC" ${sortMode === "ACTIVITY_DESC" ? "selected" : ""}>Sort: Most Logged Actions</option>
              </select>
            </div>
          </div>

          <div class="table-scroll">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Position &amp; Schedule</th>
                  <th>Availability</th>
                  <th>Role &amp; Permissions</th>
                  <th>Accomplishments &amp; Activity</th>
                  <th>Account</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>${rosterRowsHtml}</tbody>
            </table>
          </div>
        </section>
      `;
    }

    // ================= TAB 2: TASK ASSIGNMENTS & TRACKING =================
    if (activeTab === "TASKS") {
      const staffOptions = staffMembers
        .filter((s) => s.accountStatus === "Active")
        .map(
          (s) =>
            `<option value="${s.id}">${s.fullName} — ${s.positionTitle} (${s.availabilityStatus})</option>`
        )
        .join("");

      const orderOptions = (ctx.state.orders || [])
        .filter((o) => o.stage !== "Cancelled")
        .map(
          (o) =>
            `<option value="${o.id}">Order #${o.id} — ${o.clientName} (${o.stage})</option>`
        )
        .join("");

      const invOptions = (ctx.state.inventory || [])
        .filter((i) => i.category === "Stock Apparel")
        .map((i) => `<option value="${i.id}">${i.itemName} (${i.qty} pcs)</option>`)
        .join("");

      const tq = taskSearch.trim().toLowerCase();
      const filteredTasks = staffTasks.filter((t) => {
        const staffName =
          staffMembers.find((s) => s.id === t.staffMemberId)?.fullName || "";
        const matchesStatus =
          taskStatusFilter === "ALL" || t.status === taskStatusFilter;
        const matchesStaff =
          taskStaffFilter === "ALL" || t.staffMemberId === taskStaffFilter;
        const matchesSearch =
          !tq ||
          t.title.toLowerCase().includes(tq) ||
          t.taskCode.toLowerCase().includes(tq) ||
          staffName.toLowerCase().includes(tq) ||
          (t.linkedOrderId || "").toLowerCase().includes(tq);
        return matchesStatus && matchesStaff && matchesSearch;
      });

      const taskRowsHtml =
        filteredTasks.length > 0
          ? filteredTasks
              .map((task) => {
                const staff = staffMembers.find(
                  (s) => s.id === task.staffMemberId
                );
                const statusCls =
                  task.status === "Completed"
                    ? "status-available"
                    : task.status === "Cancelled"
                    ? "status-out"
                    : task.status === "In Progress"
                    ? "status-processing"
                    : "status-pending";

                const priorityTag =
                  task.priority === "Urgent"
                    ? "tag-red"
                    : task.priority === "High"
                    ? "tag-amber"
                    : "tag-blue";

                const linkedHtml = task.linkedOrderId
                  ? `<button type="button" class="btn btn-light btn-sm" data-task-jump-order="${task.linkedOrderId}">Order #${task.linkedOrderId} &rarr;</button>`
                  : task.linkedInventoryItemId
                  ? `<button type="button" class="btn btn-light btn-sm" data-task-jump-inv="1">Inventory &rarr;</button>`
                  : `<span style="color:var(--text-muted);">General Shop</span>`;

                return `<tr>
                  <td>
                    <strong>${task.title}</strong><br/>
                    <small style="color:var(--text-muted);">${task.taskCode} &bull; ${task.taskType}${
                  task.description ? ` — ${task.description}` : ""
                }</small>
                  </td>
                  <td>
                    <strong>${staff ? staff.fullName : "Unassigned"}</strong><br/>
                    <small style="color:var(--text-muted);">${
                      staff ? staff.positionTitle : ""
                    }</small>
                  </td>
                  <td>${linkedHtml}</td>
                  <td>
                    <span class="module-tag ${priorityTag}">${task.priority}</span><br/>
                    <small style="color:var(--text-muted);">${
                      task.dueDate ? `Due: ${task.dueDate}` : "No due date"
                    }</small>
                  </td>
                  <td>
                    <span class="status-pill ${statusCls}">${task.status}</span>
                    ${
                      task.completedAt
                        ? `<br/><small style="color:var(--green-text);">Done: ${task.completedAt}</small>`
                        : ""
                    }
                  </td>
                  <td>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                      ${
                        task.status === "Pending"
                          ? `<button type="button" class="btn btn-light btn-sm" data-task-status="${task.id}" data-next-status="In Progress">Start</button>`
                          : ""
                      }
                      ${
                        task.status === "Pending" || task.status === "In Progress"
                          ? `<button type="button" class="btn btn-red btn-sm" data-task-status="${task.id}" data-next-status="Completed">&#10003; Complete</button>`
                          : ""
                      }
                      ${
                        task.status === "Completed" || task.status === "Cancelled"
                          ? `<button type="button" class="btn btn-light btn-sm" data-task-status="${task.id}" data-next-status="In Progress">Reopen</button>`
                          : `<button type="button" class="btn btn-light btn-sm" data-task-status="${task.id}" data-next-status="Cancelled">Cancel</button>`
                      }
                      ${
                        canAdminStaff
                          ? `<button type="button" class="btn btn-danger-outline btn-sm" data-task-delete="${task.id}">Delete</button>`
                          : ""
                      }
                    </div>
                  </td>
                </tr>`;
              })
              .join("")
          : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">${
              staffTasks.length === 0
                ? "No operational tasks assigned yet. Add a staff member first, then assign order production, inspection, or inventory tasks above."
                : "No tasks match your current filters."
            }</td></tr>`;

      bodyHtml = `
        <section class="module-card">
          <div class="module-top">
            <div>
              <h2>Assign Operational Staff Task</h2>
              <p class="module-subtitle">Link tasks directly to Custom Orders or Finished Goods Inventory and monitor completion status.</p>
            </div>
            <span class="module-tag tag-blue">Linked to Orders &amp; Stock</span>
          </div>
          ${
            staffMembers.filter((s) => s.accountStatus === "Active").length === 0
              ? `<div class="empty-state-panel">
                  <p class="empty-state-title">Add an active staff member first</p>
                  <p class="empty-state-desc">Register at least one active staff profile in the <strong>Staff Directory &amp; Permissions</strong> tab before assigning shop tasks.</p>
                  <button type="button" class="btn btn-red btn-sm" data-staff-tab="DIRECTORY">Go to Staff Directory &rarr;</button>
                </div>`
              : `<form id="staffTaskForm" novalidate>
                  <div class="form-grid-4">
                    <div class="field">
                      <label for="tskStaffSelect">Assign To Staff *</label>
                      <select id="tskStaffSelect" required>${staffOptions}</select>
                    </div>
                    <div class="field">
                      <label for="tskTitleInput">Task Title *</label>
                      <input type="text" id="tskTitleInput" placeholder="e.g., Sublimation layout &amp; printing" required />
                    </div>
                    <div class="field">
                      <label for="tskTypeSelect">Task Category</label>
                      <select id="tskTypeSelect">
                        <option value="Order Production">Order Production</option>
                        <option value="Quality Inspection">Quality Inspection</option>
                        <option value="Inventory Check">Inventory Check</option>
                        <option value="Order Release">Order Release</option>
                        <option value="General Shop Task">General Shop Task</option>
                      </select>
                    </div>
                    <div class="field">
                      <label for="tskPrioritySelect">Priority</label>
                      <select id="tskPrioritySelect">
                        <option value="Low">Low</option>
                        <option value="Normal" selected>Normal</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>
                  </div>
                  <div class="form-grid-4">
                    <div class="field">
                      <label for="tskOrderSelect">Link Custom Order (Optional)</label>
                      <select id="tskOrderSelect">
                        <option value="">— None —</option>
                        ${orderOptions}
                      </select>
                    </div>
                    <div class="field">
                      <label for="tskInvSelect">Link Stock Product (Optional)</label>
                      <select id="tskInvSelect">
                        <option value="">— None —</option>
                        ${invOptions}
                      </select>
                    </div>
                    <div class="field">
                      <label for="tskDueDateInput">Target Due Date</label>
                      <input type="date" id="tskDueDateInput" />
                    </div>
                    <div class="field">
                      <label for="tskDescInput">Notes / Instructions</label>
                      <input type="text" id="tskDescInput" placeholder="Specific jersey specs or count details..." />
                    </div>
                  </div>
                  <div class="module-footer-actions">
                    <button type="submit" class="btn btn-red">+ Assign Task</button>
                  </div>
                </form>`
          }
        </section>

        <section class="module-card">
          <div class="module-top">
            <h2>Task Assignment &amp; Completion Queue</h2>
            <div class="toolbar-group">
              <input type="search" id="taskSearchInput" class="toolbar-input" placeholder="Search task, order #, staff..." value="${taskSearch}" />
              <select id="taskStaffFilterSelect" class="toolbar-select">
                <option value="ALL" ${taskStaffFilter === "ALL" ? "selected" : ""}>All Staff</option>
                ${staffMembers
                  .map(
                    (s) =>
                      `<option value="${s.id}" ${
                        taskStaffFilter === s.id ? "selected" : ""
                      }>${s.fullName}</option>`
                  )
                  .join("")}
              </select>
              <select id="taskStatusFilterSelect" class="toolbar-select">
                <option value="ALL" ${taskStatusFilter === "ALL" ? "selected" : ""}>All Statuses</option>
                <option value="Pending" ${taskStatusFilter === "Pending" ? "selected" : ""}>Pending</option>
                <option value="In Progress" ${taskStatusFilter === "In Progress" ? "selected" : ""}>In Progress</option>
                <option value="Completed" ${taskStatusFilter === "Completed" ? "selected" : ""}>Completed</option>
                <option value="Cancelled" ${taskStatusFilter === "Cancelled" ? "selected" : ""}>Cancelled</option>
              </select>
            </div>
          </div>
          <div class="table-scroll">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>Task Details</th>
                  <th>Assigned Staff</th>
                  <th>Linked Record</th>
                  <th>Priority &amp; Due</th>
                  <th>Status</th>
                  <th>Progress Actions</th>
                </tr>
              </thead>
              <tbody>${taskRowsHtml}</tbody>
            </table>
          </div>
        </section>
      `;
    }

    // ================= TAB 3: IMMUTABLE ACTIVITY & LOGIN AUDIT TRAIL =================
    if (activeTab === "AUDIT") {
      const uniqueActors = Array.from(
        new Set(
          auditLogs.map((a) => a.actorName || "JM Maker Owner/Manager")
        )
      ).sort();

      const aq = auditSearch.trim().toLowerCase();
      const filteredLogs = auditLogs.filter((log) => {
        const actor = log.actorName || "JM Maker Owner/Manager";
        const matchesType =
          auditTypeFilter === "ALL" || log.actionType === auditTypeFilter;
        const matchesActor =
          auditActorFilter === "ALL" || actor === auditActorFilter;
        const matchesQuery =
          !aq ||
          log.action.toLowerCase().includes(aq) ||
          log.module.toLowerCase().includes(aq) ||
          actor.toLowerCase().includes(aq);
        return matchesType && matchesActor && matchesQuery;
      });

      const auditRowsHtml =
        filteredLogs.length > 0
          ? filteredLogs
              .map((log) => {
                const actor = log.actorName || "JM Maker Owner/Manager";
                const roleLabel =
                  log.actorRole === "staff"
                    ? "Staff"
                    : log.actorRole === "supervisor"
                    ? "Supervisor"
                    : "Owner/Manager";
                const typeTag =
                  log.actionType === "price_change" ||
                  log.actionType === "inventory_update"
                    ? "tag-amber"
                    : log.actionType === "login" || log.actionType === "logout"
                    ? "tag-green"
                    : log.actionType === "staff_admin"
                    ? "tag-red"
                    : "tag-blue";

                return `<tr>
                  <td style="white-space:nowrap;"><strong>${log.timestamp}</strong></td>
                  <td>
                    <strong>${actor}</strong><br/>
                    <small style="color:var(--text-muted);">${roleLabel}</small>
                  </td>
                  <td><span class="module-tag ${typeTag}">${formatActionTypeLabel(
                  log.actionType
                )}</span></td>
                  <td><span class="module-tag tag-red">${log.module}</span></td>
                  <td>${log.action}</td>
                </tr>`;
              })
              .join("")
          : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">No operational activity records match your filters.</td></tr>`;

      bodyHtml = `
        <section class="module-card">
          <div class="module-top">
            <div>
              <h2>Immutable Activity &amp; Login Audit Trail</h2>
              <p class="module-subtitle">
                Chronological, append-only record of user logins, order status updates, task completions, and price or inventory modifications (Interview Q17–Q18).
              </p>
            </div>
            <span class="module-tag tag-green">Append-Only &bull; Immutable</span>
          </div>

          <div class="toolbar-group" style="margin-bottom:4px;">
            <input type="search" id="auditSearchInput" class="toolbar-input" style="flex:1;min-width:200px;" placeholder="Search action, order #, user, module..." value="${auditSearch}" />
            <select id="auditTypeFilterSelect" class="toolbar-select">
              <option value="ALL" ${auditTypeFilter === "ALL" ? "selected" : ""}>All Event Types</option>
              <option value="login" ${auditTypeFilter === "login" ? "selected" : ""}>User Logins</option>
              <option value="logout" ${auditTypeFilter === "logout" ? "selected" : ""}>User Logouts</option>
              <option value="order_update" ${auditTypeFilter === "order_update" ? "selected" : ""}>Order Updates</option>
              <option value="task_update" ${auditTypeFilter === "task_update" ? "selected" : ""}>Task Completions</option>
              <option value="inventory_update" ${auditTypeFilter === "inventory_update" ? "selected" : ""}>Inventory Changes</option>
              <option value="price_change" ${auditTypeFilter === "price_change" ? "selected" : ""}>Price Changes</option>
              <option value="payment" ${auditTypeFilter === "payment" ? "selected" : ""}>Payments &amp; Sales</option>
              <option value="backup" ${auditTypeFilter === "backup" ? "selected" : ""}>Backups &amp; Restores</option>
              <option value="staff_admin" ${auditTypeFilter === "staff_admin" ? "selected" : ""}>Staff &amp; Permissions</option>
            </select>
            <select id="auditActorFilterSelect" class="toolbar-select">
              <option value="ALL" ${auditActorFilter === "ALL" ? "selected" : ""}>All Users / Actors</option>
              ${uniqueActors
                .map(
                  (a) =>
                    `<option value="${a}" ${
                      auditActorFilter === a ? "selected" : ""
                    }>${a}</option>`
                )
                .join("")}
            </select>
          </div>

          <div class="table-scroll">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Performed By</th>
                  <th>Event Type</th>
                  <th>Module</th>
                  <th>Activity Description</th>
                </tr>
              </thead>
              <tbody>${auditRowsHtml}</tbody>
            </table>
          </div>
        </section>
      `;
    }

    container.innerHTML = `${subnavHtml}${kpiHtml}${bodyHtml}`;
  }

  // ---------------- INPUT & FILTER EVENTS ----------------
  container?.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "staffSearchInput") {
      staffSearch = (target as HTMLInputElement).value;
      render();
      restoreInputFocus("staffSearchInput");
    } else if (target.id === "taskSearchInput") {
      taskSearch = (target as HTMLInputElement).value;
      render();
      restoreInputFocus("taskSearchInput");
    } else if (target.id === "auditSearchInput") {
      auditSearch = (target as HTMLInputElement).value;
      render();
      restoreInputFocus("auditSearchInput");
    }
  });

  container?.addEventListener("change", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "staffAvailFilter") {
      availabilityFilter = (target as HTMLSelectElement)
        .value as "ALL" | StaffAvailabilityStatus;
      render();
    } else if (target.id === "staffSortSelect") {
      sortMode = (target as HTMLSelectElement).value as StaffSortMode;
      render();
    } else if (target.id === "taskStaffFilterSelect") {
      taskStaffFilter = (target as HTMLSelectElement).value;
      render();
    } else if (target.id === "taskStatusFilterSelect") {
      taskStatusFilter = (target as HTMLSelectElement)
        .value as "ALL" | StaffTaskStatus;
      render();
    } else if (target.id === "auditTypeFilterSelect") {
      auditTypeFilter = (target as HTMLSelectElement)
        .value as "ALL" | AuditActionType;
      render();
    } else if (target.id === "auditActorFilterSelect") {
      auditActorFilter = (target as HTMLSelectElement).value;
      render();
    }
  });

  // ---------------- CLICK EVENTS ----------------
  container?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    const tabBtn = target.closest("[data-staff-tab]") as HTMLElement | null;
    if (tabBtn) {
      activeTab = tabBtn.getAttribute("data-staff-tab") as StaffTabMode;
      render();
      return;
    }

    if (target.id === "staffPrintReportBtn") {
      const perf = computeStaffPerformance(
        ctx.state.staffMembers || [],
        ctx.state.staffTasks || [],
        ctx.state.auditLogs || []
      );
      appendAuditLog(
        ctx.state,
        "Staff Monitoring",
        "Printed Staff Monitoring & Immutable Audit Trail Report.",
        { actionType: "staff_admin" }
      );
      ctx.refreshAll();
      ctx.printHtml(
        buildPrintableStaffMonitoringReportHtml(
          perf,
          ctx.state.staffTasks || [],
          ctx.state.auditLogs || []
        )
      );
      return;
    }

    if (target.id === "staffCancelEditBtn") {
      editingStaffId = null;
      render();
      return;
    }

    // Staff availability quick toggle
    const availBtn = target.closest("[data-staff-avail]") as HTMLElement | null;
    if (availBtn) {
      const staffId = availBtn.getAttribute("data-staff-avail");
      const val = availBtn.getAttribute(
        "data-avail-val"
      ) as StaffAvailabilityStatus;
      const staff = (ctx.state.staffMembers || []).find((s) => s.id === staffId);
      if (staff && val) {
        staff.availabilityStatus = val;
        appendAuditLog(
          ctx.state,
          "Staff Monitoring",
          `Updated ${staff.fullName} (${staff.staffCode}) availability status to "${val}".`,
          { actionType: "staff_admin", staffMemberId: staff.id }
        );
        ctx.refreshAll();
        ctx.showToast(`${staff.fullName} marked as ${val}.`);
      }
      return;
    }

    const editBtn = target.closest("[data-staff-edit]") as HTMLElement | null;
    if (editBtn) {
      editingStaffId = editBtn.getAttribute("data-staff-edit");
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const toggleStatusBtn = target.closest(
      "[data-staff-toggle-status]"
    ) as HTMLElement | null;
    if (toggleStatusBtn) {
      const staffId = toggleStatusBtn.getAttribute("data-staff-toggle-status");
      const staff = (ctx.state.staffMembers || []).find((s) => s.id === staffId);
      if (staff) {
        staff.accountStatus =
          staff.accountStatus === "Active" ? "Inactive" : "Active";
        appendAuditLog(
          ctx.state,
          "Staff Monitoring",
          `Set ${staff.fullName} (${staff.staffCode}) account status to ${staff.accountStatus}.`,
          { actionType: "staff_admin", staffMemberId: staff.id }
        );
        ctx.refreshAll();
        ctx.showToast(
          `${staff.fullName}'s account is now ${staff.accountStatus}.`
        );
      }
      return;
    }

    const deleteStaffBtn = target.closest(
      "[data-staff-delete]"
    ) as HTMLElement | null;
    if (deleteStaffBtn) {
      const staffId = deleteStaffBtn.getAttribute("data-staff-delete");
      const idx = (ctx.state.staffMembers || []).findIndex(
        (s) => s.id === staffId
      );
      if (idx >= 0) {
        const removed = ctx.state.staffMembers[idx];
        ctx.state.staffMembers.splice(idx, 1);
        ctx.state.staffTasks = (ctx.state.staffTasks || []).filter(
          (t) => t.staffMemberId !== removed.id
        );
        if (editingStaffId === removed.id) editingStaffId = null;
        appendAuditLog(
          ctx.state,
          "Staff Monitoring",
          `Removed staff profile ${removed.fullName} (${removed.staffCode}).`,
          { actionType: "staff_admin" }
        );
        ctx.refreshAll();
        ctx.showToast(`Removed ${removed.fullName} from Staff Directory.`);
      }
      return;
    }

    // Task status progression
    const taskStatusBtn = target.closest(
      "[data-task-status]"
    ) as HTMLElement | null;
    if (taskStatusBtn) {
      const taskId = taskStatusBtn.getAttribute("data-task-status");
      const nextStatus = taskStatusBtn.getAttribute(
        "data-next-status"
      ) as StaffTaskStatus;
      const task = (ctx.state.staffTasks || []).find((t) => t.id === taskId);
      if (task && nextStatus) {
        task.status = nextStatus;
        task.completedAt =
          nextStatus === "Completed" ? formatLogbookDateNow() : undefined;
        const staffName =
          (ctx.state.staffMembers || []).find((s) => s.id === task.staffMemberId)
            ?.fullName || "Staff";

        appendAuditLog(
          ctx.state,
          "Staff Tasks",
          `Updated task ${task.taskCode} ("${task.title}", assigned to ${staffName}) to ${nextStatus}.`,
          {
            actionType: "task_update",
            staffMemberId: task.staffMemberId,
            relatedOrderId: task.linkedOrderId,
            relatedTaskId: task.id,
          }
        );

        if (nextStatus === "Completed") {
          pushNotification(ctx.state, {
            title: `Staff Task Completed — ${task.taskCode}`,
            message: `${staffName} completed "${task.title}"${
              task.linkedOrderId ? ` for Order #${task.linkedOrderId}` : ""
            }.`,
            category: "Fulfillment",
            severity: "success",
            targetPage: "staff-monitoring",
            linkedOrderId: task.linkedOrderId,
          });
        }
        ctx.refreshAll();
        ctx.showToast(`Task ${task.taskCode} marked as ${nextStatus}.`);
      }
      return;
    }

    const deleteTaskBtn = target.closest(
      "[data-task-delete]"
    ) as HTMLElement | null;
    if (deleteTaskBtn) {
      const taskId = deleteTaskBtn.getAttribute("data-task-delete");
      const idx = (ctx.state.staffTasks || []).findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        const removed = ctx.state.staffTasks[idx];
        ctx.state.staffTasks.splice(idx, 1);
        appendAuditLog(
          ctx.state,
          "Staff Tasks",
          `Deleted task ${removed.taskCode} ("${removed.title}").`,
          { actionType: "task_update", staffMemberId: removed.staffMemberId }
        );
        ctx.refreshAll();
        ctx.showToast(`Deleted task ${removed.taskCode}.`);
      }
      return;
    }

    const jumpOrderBtn = target.closest(
      "[data-task-jump-order]"
    ) as HTMLElement | null;
    if (jumpOrderBtn) {
      const oid = jumpOrderBtn.getAttribute("data-task-jump-order") || undefined;
      ctx.navigateTo("workflow", oid);
      return;
    }

    if (target.closest("[data-task-jump-inv]")) {
      ctx.navigateTo("inventory");
    }
  });

  // ---------------- FORM SUBMISSIONS ----------------
  container?.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;

    if (form.id === "staffMemberForm") {
      e.preventDefault();
      if (!isOwnerManager(getOwnerSession())) {
        ctx.showToast("Only the Owner/Manager can modify staff records.");
        return;
      }

      const fullName = (
        document.getElementById("stfFullName") as HTMLInputElement
      ).value.trim();
      const positionTitle = (
        document.getElementById("stfPosition") as HTMLInputElement
      ).value.trim();
      const roleLevel = (
        document.getElementById("stfRoleLevel") as HTMLSelectElement
      ).value as StaffRoleLevel;
      const availabilityStatus = (
        document.getElementById("stfAvailability") as HTMLSelectElement
      ).value as StaffAvailabilityStatus;
      const contactNumber = (
        document.getElementById("stfContact") as HTMLInputElement
      ).value.trim();
      const shiftSchedule =
        (
          document.getElementById("stfShift") as HTMLInputElement
        ).value.trim() || "Mon–Sat 8:00 AM – 5:00 PM";
      const email = (
        document.getElementById("stfEmail") as HTMLInputElement
      ).value
        .trim()
        .toLowerCase();
      const loginPassword = (
        document.getElementById("stfPassword") as HTMLInputElement
      ).value;

      if (fullName.length < 2) {
        ctx.showToast("Please enter the staff member's full name (min. 2 characters).");
        return;
      }
      if (positionTitle.length < 2) {
        ctx.showToast("Please enter the staff member's position or responsibility.");
        return;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        ctx.showToast("Please enter a valid email address or leave it blank.");
        return;
      }
      if (loginPassword && loginPassword.length < 6) {
        ctx.showToast("Staff login password must be at least 6 characters.");
        return;
      }

      const permissions = {
        canManagePOS: Boolean(
          (document.getElementById("permPosChk") as HTMLInputElement)?.checked
        ),
        canManageOrders: Boolean(
          (document.getElementById("permOrdersChk") as HTMLInputElement)?.checked
        ),
        canManageInventory: Boolean(
          (document.getElementById("permInvChk") as HTMLInputElement)?.checked
        ),
        canVerifyPayments: Boolean(
          (document.getElementById("permPayChk") as HTMLInputElement)?.checked
        ),
        canViewReports: Boolean(
          (document.getElementById("permRepChk") as HTMLInputElement)?.checked
        ),
      };

      if (!Array.isArray(ctx.state.staffMembers)) ctx.state.staffMembers = [];

      if (editingStaffId) {
        const existing = ctx.state.staffMembers.find(
          (s) => s.id === editingStaffId
        );
        if (existing) {
          existing.fullName = fullName;
          existing.positionTitle = positionTitle;
          existing.roleLevel = roleLevel;
          existing.availabilityStatus = availabilityStatus;
          existing.contactNumber = contactNumber;
          existing.shiftSchedule = shiftSchedule;
          existing.email = email || undefined;
          existing.loginPassword = loginPassword || undefined;
          existing.permissions = permissions;
          appendAuditLog(
            ctx.state,
            "Staff Monitoring",
            `Updated staff profile & permissions for ${fullName} (${existing.staffCode}).`,
            { actionType: "staff_admin", staffMemberId: existing.id }
          );
          editingStaffId = null;
          ctx.refreshAll();
          ctx.showToast(`Updated profile & permissions for ${fullName}.`);
        }
      } else {
        const staffCode = generateNextStaffCode(ctx.state.staffMembers);
        const newStaff: StaffMember = {
          id: staffCode,
          staffCode,
          fullName,
          email: email || undefined,
          loginPassword: loginPassword || undefined,
          contactNumber,
          positionTitle,
          roleLevel,
          availabilityStatus,
          accountStatus: "Active",
          shiftSchedule,
          permissions,
          createdAt: formatTimeNow(),
        };
        ctx.state.staffMembers.push(newStaff);
        appendAuditLog(
          ctx.state,
          "Staff Monitoring",
          `Registered staff member ${fullName} (${staffCode}, ${positionTitle}) with permissions: ${
            formatPermissionLabels(permissions).join(", ") || "View Only"
          }.`,
          { actionType: "staff_admin", staffMemberId: newStaff.id }
        );
        ctx.refreshAll();
        ctx.showToast(`Added ${fullName} (${staffCode}) to Staff Directory.`);
      }
      return;
    }

    if (form.id === "staffTaskForm") {
      e.preventDefault();
      const staffMemberId = (
        document.getElementById("tskStaffSelect") as HTMLSelectElement
      )?.value;
      const title = (
        document.getElementById("tskTitleInput") as HTMLInputElement
      )?.value.trim();
      const taskType = (
        document.getElementById("tskTypeSelect") as HTMLSelectElement
      )?.value as StaffTaskType;
      const priority = (
        document.getElementById("tskPrioritySelect") as HTMLSelectElement
      )?.value as StaffTaskPriority;
      const linkedOrderId =
        (document.getElementById("tskOrderSelect") as HTMLSelectElement)?.value ||
        undefined;
      const linkedInventoryItemId =
        (document.getElementById("tskInvSelect") as HTMLSelectElement)?.value ||
        undefined;
      const dueDate =
        (document.getElementById("tskDueDateInput") as HTMLInputElement)?.value ||
        undefined;
      const description =
        (document.getElementById("tskDescInput") as HTMLInputElement)?.value.trim() ||
        "";

      if (!staffMemberId) {
        ctx.showToast("Please select a staff member for this task.");
        return;
      }
      if (!title || title.length < 2) {
        ctx.showToast("Please enter a descriptive task title (min. 2 characters).");
        return;
      }

      if (!Array.isArray(ctx.state.staffTasks)) ctx.state.staffTasks = [];
      const taskCode = generateNextTaskCode(ctx.state.staffTasks);
      const staffName =
        (ctx.state.staffMembers || []).find((s) => s.id === staffMemberId)
          ?.fullName || staffMemberId;

      const newTask: StaffTask = {
        id: taskCode,
        taskCode,
        staffMemberId,
        linkedOrderId,
        linkedInventoryItemId,
        title,
        description,
        taskType,
        priority,
        status: "Pending",
        dueDate,
        createdAt: formatTimeNow(),
      };
      ctx.state.staffTasks.unshift(newTask);

      appendAuditLog(
        ctx.state,
        "Staff Tasks",
        `Assigned task ${taskCode} ("${title}") to ${staffName}${
          linkedOrderId ? ` for Order #${linkedOrderId}` : ""
        }.`,
        {
          actionType: "task_update",
          staffMemberId,
          relatedOrderId: linkedOrderId,
          relatedTaskId: newTask.id,
        }
      );

      pushNotification(ctx.state, {
        title: `New Staff Task Assigned — ${taskCode}`,
        message: `Assigned "${title}" (${priority}) to ${staffName}.`,
        category: "Store",
        severity: priority === "Urgent" ? "urgent" : "info",
        targetPage: "staff-monitoring",
        linkedOrderId,
      });

      ctx.refreshAll();
      ctx.showToast(`Assigned ${taskCode} to ${staffName}.`);
    }
  });

  return { render };
}
