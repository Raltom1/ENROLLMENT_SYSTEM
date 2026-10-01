/* =========================================================
   SCHOOL ENROLLMENT MANAGEMENT SYSTEM — APP LOGIC
   Organized into modules. Everything talks to Google Apps
   Script through the CONFIG.API_URL endpoint, and caches
   through LocalStorage. Google Sheets is always the source
   of truth; LocalStorage is only a convenience cache.
   ========================================================= */

/* ================= 1. CONFIG ================= */
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbwXHICN6osDz_S-sd4OCZDArMxX1bJrrN7c4j5OwbmmA2uSnaCHiscQtN6AkxCmw9UQ/exec",
  API_TIMEOUT_MS: 20000,
  POLL_INTERVAL_MS: 20000,
  STORAGE_PREFIX: "sems_"
};

/* ================= 2. STATE ================= */
const STATE = {
  session: null,          // { username, role, token }
  students: [],
  sections: [],
  grades: [],             // flat list { StudentID, Section-scoped subject grades... } normalized below
  users: [],
  enrollmentRequests: [],
  announcements: [],
  currentEnrollmentRequest: null,
  settings: {
    SystemTitle: "School Enrollment Management System",
    SchoolName: "",
    SchoolYear: "",
    Semester: "1st",
    Subjects: "English,Mathematics,Science,Filipino,Araling Panlipunan",
    PassingGrade: 75
  },
  currentSection: null,      // section object currently open in modal
  currentActionStudent: null,// student object currently targeted by action modal
  enrollmentSort: { field: "LastName", dir: "asc" },
  pollTimer: null,
  isOnline: true
};

/* ================= 3. LOCALSTORAGE MANAGER ================= */
const Store = {
  key(name) {
    const deploymentId = CONFIG.API_URL.match(/\/s\/([^/]+)/)?.[1] || "default";
    return `${CONFIG.STORAGE_PREFIX}${deploymentId}_${name}`;
  },
  get(name, fallback = null) {
    try {
      const raw = localStorage.getItem(this.key(name));
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(name, value) {
    try { localStorage.setItem(this.key(name), JSON.stringify(value)); }
    catch (e) { console.warn("LocalStorage write failed", e); }
  },
  remove(name) { localStorage.removeItem(this.key(name)); },
  clearAll() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(CONFIG.STORAGE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  }
};

/* ================= 4. API LAYER ================= */
/* Uses text/plain POST body to avoid CORS preflight issues with
   Google Apps Script web apps (a well-known GAS + fetch pattern). */
const Api = {
  writeVersion: 0,
  mutatingActions: new Set([
    "addStudent", "updateStudent", "transferStudent", "addSection", "updateSection", "removeSection",
    "saveGrades", "updateSettings", "reviewEnrollmentRequest", "resetUserPassword", "submitEnrollment",
    "saveAnnouncement", "removeAnnouncement"
  ]),
  async call(action, payload = {}) {
    if (!CONFIG.API_URL || CONFIG.API_URL.includes("PASTE_YOUR")) {
      throw new Error("API_URL is not configured yet.");
    }
    const body = JSON.stringify({
      action,
      payload,
      token: STATE.session ? STATE.session.token : null
    });
    if (this.mutatingActions.has(action)) this.writeVersion++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
    let res;
    let responseText;
    try {
      res = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
        signal: controller.signal
      });
      responseText = await res.text();
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error("The server did not respond in time. Checking whether the change was saved.");
        timeoutError.name = "ApiTimeoutError";
        timeoutError.action = action;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) throw new Error("Network response was not ok (" + res.status + ")");
    let json;
    try {
      json = JSON.parse(responseText);
    } catch (error) {
      throw new Error("The server returned an invalid response. Check the Apps Script deployment.");
    }
    if (json.message === "Session expired. Please log in again.") {
      Auth.expireSession();
      throw new Error(json.message);
    }
    if (!json.success) throw new Error(json.message || "Request failed");
    return json.data;
  }
};

/* ================= 5. TOAST MANAGER ================= */
const Toast = {
  show(message, type = "info") {
    const container = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = "toast toast-" + type;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 220);
    }, 3600);
  },
  success(msg) { this.show(msg, "success"); },
  error(msg) { this.show(msg, "error"); },
  warning(msg) { this.show(msg, "warning"); },
  info(msg) { this.show(msg, "info"); }
};

/* ================= 6. MODAL MANAGER ================= */
const Modal = {
  open(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  },
  close(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
};
document.addEventListener("click", (e) => {
  const closeAttr = e.target.closest("[data-close]");
  if (closeAttr) Modal.close(closeAttr.getAttribute("data-close"));
  if (e.target.classList.contains("modal-overlay")) e.target.hidden = true;
});

/* ================= 7. SORTING / SEARCH UTILITIES ================= */
function sortStudents(list, field = "LastName", dir = "asc") {
  const sorted = [...list].sort((a, b) => {
    const primary = compareField(a, b, "LastName");
    if (field === "LastName" && primary !== 0) return dir === "asc" ? primary : -primary;
    if (primary !== 0 && field === "LastName") return primary;
    // default chain: LastName -> FirstName -> MiddleName
    const chainFields = field === "LastName" ? ["LastName", "FirstName", "MiddleName"] : [field, "LastName", "FirstName", "MiddleName"];
    for (const f of chainFields) {
      const c = compareField(a, b, f);
      if (c !== 0) return dir === "asc" ? c : -c;
    }
    return 0;
  });
  return sorted;
}
function compareField(a, b, field) {
  const av = (a[field] || "").toString().toLowerCase();
  const bv = (b[field] || "").toString().toLowerCase();
  return av.localeCompare(bv);
}
function studentMatchesSearch(student, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const full = `${student.FirstName} ${student.LastName} ${student.MiddleName || ""}`.toLowerCase();
  return (
    (student.StudentID || "").toLowerCase().includes(q) ||
    (student.LastName || "").toLowerCase().includes(q) ||
    (student.FirstName || "").toLowerCase().includes(q) ||
    full.includes(q)
  );
}
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* ================= 8. AUTH MODULE ================= */
const Auth = {
  init() {
    const session = Store.get("session");
    if (session && session.token && ["Admin", "Student"].includes(session.role)) {
      STATE.session = session;
      if (window.IS_ADMIN_PAGE && session.role === "Admin") App.enterApp();
      else if (window.IS_STUDENT_PAGE && session.role === "Student") StudentApp.enter();
      else window.location.href = session.role === "Admin" ? "admin.html" : "student.html";
    } else {
      Store.remove("session");
      if (window.IS_ADMIN_PAGE || window.IS_STUDENT_PAGE) window.location.href = "index.html";
      else App.showLogin();
    }
    const loginForm = document.getElementById("login-form");
    if (loginForm) loginForm.addEventListener("submit", this.handleLogin.bind(this));
    const signupForm = document.getElementById("signup-form");
    if (signupForm) signupForm.addEventListener("submit", this.handleSignup.bind(this));
    const signupButton = document.getElementById("open-signup-btn");
    if (signupButton) signupButton.addEventListener("click", () => Modal.open("modal-signup"));
    const logoutButton = document.getElementById("logout-btn");
    if (logoutButton) logoutButton.addEventListener("click", () => Modal.open("modal-admin-logout"));
    const confirmLogoutButton = document.getElementById("confirm-admin-logout");
    if (confirmLogoutButton) confirmLogoutButton.addEventListener("click", this.logout.bind(this));
  },
  async handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");
    const btn = document.getElementById("login-submit-btn");
    errorEl.hidden = true;
    this.setLoading(btn, true);
    try {
      const data = await Api.call("login", { username, password });
      STATE.session = { username: data.username, role: data.role, token: data.token };
      Store.set("session", STATE.session);
      Toast.success("Welcome back, " + data.username + ".");
      window.location.href = data.role === "Admin" ? "admin.html" : "student.html";
    } catch (err) {
      errorEl.textContent = err.message || "Invalid username or password.";
      errorEl.hidden = false;
    } finally {
      this.setLoading(btn, false);
    }
  },
  async handleSignup(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const password = document.getElementById("signup-password").value;
    const confirmPassword = document.getElementById("signup-confirm-password").value;
    const error = document.getElementById("signup-error");
    const button = form.querySelector("button[type=submit]");
    error.hidden = true;
    if (password !== confirmPassword) {
      error.textContent = "Passwords do not match.";
      error.hidden = false;
      return;
    }
    this.setLoading(button, true);
    try {
      await Api.call("studentSignup", {
        username: document.getElementById("signup-username").value.trim(),
        password
      });
      Modal.close("modal-signup");
      form.reset();
      Toast.success("Account created. Log in to submit your enrollment form.");
    } catch (err) {
      error.textContent = err.message || "Unable to create the account.";
      error.hidden = false;
    } finally {
      this.setLoading(button, false);
    }
  },
  setLoading(btn, loading) {
    btn.disabled = loading;
    btn.querySelector(".btn-label").style.visibility = loading ? "hidden" : "visible";
    btn.querySelector(".spinner").hidden = !loading;
  },
  async logout() {
    const button = document.getElementById("confirm-admin-logout");
    if (button) {
      button.disabled = true;
      button.querySelector(".btn-label").textContent = "Signing out";
      button.querySelector(".logout-confirm-icon").hidden = true;
      button.querySelector(".logout-confirm-spinner").hidden = false;
    }
    await new Promise(resolve => setTimeout(resolve, 450));
    STATE.session = null;
    Store.remove("session");
    Polling.stop();
    if (window.IS_ADMIN_PAGE) {
      window.location.href = "index.html";
    } else {
      Toast.info("You have been logged out.");
      App.showLogin();
    }
  },
  expireSession() {
    STATE.session = null;
    Store.remove("session");
    Polling.stop();
    if (window.IS_ADMIN_PAGE || window.IS_STUDENT_PAGE) window.location.href = "index.html";
  }
};

/* ================= 9. SIDEBAR / NAVIGATION ================= */
const Nav = {
  init() {
    document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
      btn.addEventListener("click", () => this.goTo(btn.dataset.page));
    });
    document.getElementById("hamburger-btn").addEventListener("click", () => this.toggleSidebar());
    document.getElementById("sidebar-overlay").addEventListener("click", () => this.closeSidebar());
  },
  goTo(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-item[data-page]").forEach(n => n.classList.remove("active"));
    document.getElementById("page-" + page).classList.add("active");
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add("active");
    document.getElementById("topbar-title").textContent =
      document.querySelector(`.nav-item[data-page="${page}"] span`).textContent;
    this.closeSidebar();
  },
  toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebar-overlay").classList.toggle("show");
  },
  closeSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebar-overlay").classList.remove("show");
  }
};

/* ================= 10. DASHBOARD ================= */
const Dashboard = {
  render() {
    const totalStudents = STATE.students.length;
    const totalEnrolled = STATE.students.filter(s => s.Status !== "Inactive").length;
    const totalSections = STATE.sections.length;
    const gradedIds = new Set(STATE.grades.filter(g => g.Grade !== "" && g.Grade !== null && g.Grade !== undefined).map(g => g.StudentID));
    const withGrades = gradedIds.size;
    const withoutGrades = Math.max(totalStudents - withGrades, 0);

    document.getElementById("stat-total-students").textContent = totalStudents;
    document.getElementById("stat-total-enrolled").textContent = totalEnrolled;
    document.getElementById("stat-total-sections").textContent = totalSections;
    document.getElementById("stat-with-grades").textContent = withGrades;
    document.getElementById("stat-without-grades").textContent = withoutGrades;

    const grid = document.getElementById("dashboard-section-grid");
    grid.innerHTML = "";
    STATE.sections.forEach(sec => {
      const count = STATE.students.filter(s => s.SectionID === sec.SectionID).length;
      const card = document.createElement("div");
      card.className = "section-card";
      card.innerHTML = `
        <h4>${escapeHtml(sec.GradeLevel)} - ${escapeHtml(sec.SectionName)}</h4>
        <p class="count">${count} student${count === 1 ? "" : "s"}</p>
        <span class="status-badge ${sec.Status === "Active" ? "badge-success" : "badge-danger"}">${escapeHtml(sec.Status || "Active")}</span>
      `;
      card.addEventListener("click", () => Sections.openSectionModal(sec));
      grid.appendChild(card);
    });
  }
};

/* ================= 11. SECTIONS MODULE ================= */
const Sections = {
  init() {
    document.getElementById("add-section-btn").addEventListener("click", () => this.openAddSectionForm());
    document.getElementById("add-section-form").addEventListener("submit", this.handleAddSection.bind(this));
    document.getElementById("section-modal-search").addEventListener("input", () => this.renderSectionModalTable());
    document.getElementById("sections-search").addEventListener("input", () => this.render());
  },
  render() {
    const grid = document.getElementById("sections-grid");
    grid.innerHTML = "";
    const query = (document.getElementById("sections-search")?.value || "").trim().toLowerCase();
    const sections = STATE.sections.filter(sec => `${sec.GradeLevel} ${sec.SectionName}`.toLowerCase().includes(query));
    const empty = document.getElementById("sections-empty");
    if (empty) empty.hidden = sections.length !== 0;
    sections.forEach(sec => {
      const count = STATE.students.filter(s => s.SectionID === sec.SectionID).length;
      const card = document.createElement("div");
      card.className = "section-card";
      card.dataset.sectionId = sec.SectionID;
      card.innerHTML = `
        <h4>${escapeHtml(sec.GradeLevel)} - ${escapeHtml(sec.SectionName)}</h4>
        <p class="count">Students: ${count}</p>
        <span class="status-badge ${sec.Status === "Active" ? "badge-success" : "badge-danger"}">${escapeHtml(sec.Status || "Active")}</span>
        <div class="section-card-actions"><button class="table-action-btn section-edit-btn" type="button">Edit</button><button class="table-action-btn section-remove-btn" type="button">Remove</button></div>
        <div class="section-card-loader" hidden aria-live="polite"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".25" stroke-width="2.5"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg><span>Saving section</span></div>
      `;
      card.addEventListener("click", () => this.openSectionModal(sec));
      card.querySelector(".section-edit-btn").addEventListener("click", event => {
        event.stopPropagation();
        this.openEditSectionForm(sec);
      });
      card.querySelector(".section-remove-btn").addEventListener("click", event => {
        event.stopPropagation();
        this.removeSection(sec);
      });
      grid.appendChild(card);
    });
    this.populateSectionDropdowns();
  },
  setCardLoading(sectionId, loading, message = "Saving section") {
    const card = [...document.querySelectorAll("#sections-grid .section-card")]
      .find(item => item.dataset.sectionId === String(sectionId));
    if (!card) return;
    const loader = card.querySelector(".section-card-loader");
    loader.querySelector("span").textContent = message;
    loader.hidden = !loading;
    card.querySelectorAll("button").forEach(button => { button.disabled = loading; });
  },
  populateSectionDropdowns() {
    const opts = STATE.sections
      .filter(s => String(s.Status || "Active").toLowerCase() === "active")
      .map(s => `<option value="${escapeHtml(s.SectionID)}">${escapeHtml(s.GradeLevel)} - ${escapeHtml(s.SectionName)}</option>`)
      .join("");
    document.getElementById("f-section").innerHTML = `<option value="">Select Section</option>` + opts;
    document.getElementById("transfer-new-section").innerHTML = opts;
    document.getElementById("grading-section-select").innerHTML = `<option value="">-- Select School Section --</option>` + opts;
    const announcementSection = document.getElementById("announcement-section");
    const reviewSection = document.getElementById("review-section");
    if (announcementSection) announcementSection.innerHTML = `<option value="">Select section</option>` + opts;
    if (reviewSection) reviewSection.innerHTML = `<option value="">Select section to approve</option>` + opts;
  },
  openSectionModal(sec) {
    STATE.currentSection = sec;
    document.getElementById("section-modal-title").textContent = `${sec.GradeLevel} - ${sec.SectionName}`;
    document.getElementById("section-modal-search").value = "";
    this.renderSectionModalTable();
    Modal.open("modal-section");
  },
  renderSectionModalTable() {
    const sec = STATE.currentSection;
    if (!sec) return;
    const query = document.getElementById("section-modal-search").value;
    let list = STATE.students.filter(s => s.SectionID === sec.SectionID);
    list = sortStudents(list, "LastName", "asc").filter(s => studentMatchesSearch(s, query));
    document.getElementById("section-modal-count").textContent = `${list.length} student${list.length === 1 ? "" : "s"}`;
    const tbody = document.getElementById("section-modal-tbody");
    tbody.innerHTML = "";
    document.getElementById("section-modal-empty").hidden = list.length !== 0;
    list.forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.StudentID)}</td>
        <td>${escapeHtml(s.LastName)}, ${escapeHtml(s.FirstName)}</td>
        <td>${escapeHtml(s.Gender)}</td>
        <td>${escapeHtml(sec.GradeLevel)}-${escapeHtml(sec.SectionName)}</td>
        <td><button class="table-action-btn" data-action-id="${escapeHtml(s.StudentID)}">Action</button></td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("[data-action-id]").forEach(btn => {
      btn.addEventListener("click", () => Students.openActionModal(btn.dataset.actionId));
    });
  },
  async handleAddSection(e) {
    e.preventDefault();
    const mode = document.getElementById("section-form-mode").value;
    const gradeLevel = document.getElementById("f-grade-level").value.trim();
    const sectionName = document.getElementById("f-section-name").value.trim();
    const sectionId = document.getElementById("section-form-id").value;
    const btn = e.target.querySelector("button[type=submit]");
    Auth.setLoading(btn, true);
    try {
      const dup = STATE.sections.some(s => s.SectionID !== sectionId &&
        s.GradeLevel.toLowerCase() === gradeLevel.toLowerCase() &&
        s.SectionName.toLowerCase() === sectionName.toLowerCase());
      if (dup) throw new Error("This section already exists.");
      if (mode === "edit") this.setCardLoading(sectionId, true, "Saving changes");
      let savedSection;
      let confirmedAfterRetry = false;
      try {
        savedSection = mode === "edit"
          ? await Api.call("updateSection", { SectionID: sectionId, GradeLevel: gradeLevel, SectionName: sectionName })
          : await Api.call("addSection", { GradeLevel: gradeLevel, SectionName: sectionName });
      } catch (apiError) {
        let snapshot;
        try { snapshot = await Api.call("getSnapshot", {}); }
        catch (_) { throw apiError; }
        savedSection = (snapshot.sections || []).find(section => mode === "edit"
          ? String(section.SectionID) === String(sectionId) && section.GradeLevel === gradeLevel && section.SectionName === sectionName
          : section.GradeLevel.toLowerCase() === gradeLevel.toLowerCase() && section.SectionName.toLowerCase() === sectionName.toLowerCase());
        if (!savedSection) throw apiError;
        STATE.sections = snapshot.sections || [];
        confirmedAfterRetry = true;
      }
      if (mode === "edit") {
        const index = STATE.sections.findIndex(section => section.SectionID === sectionId);
        if (index !== -1) STATE.sections[index] = savedSection;
      } else if (!STATE.sections.some(section => section.SectionID === savedSection.SectionID)) {
        STATE.sections.push(savedSection);
      }
      Store.set("sections", STATE.sections);
      Modal.close("modal-add-section");
      e.target.reset();
      try {
        this.render();
        Dashboard.render();
        Toast.success(confirmedAfterRetry ? "Section saved successfully. The response was delayed; server data is confirmed." : mode === "edit" ? "Section updated successfully." : "Section created successfully.");
      } catch (renderError) {
        console.error("Section saved, but the dashboard could not refresh.", renderError);
        Toast.warning("Section saved. Refresh the page to update the dashboard.");
      }
    } catch (err) {
      Toast.error(err.name === "ApiTimeoutError" ? "The section save could not be confirmed. Refresh the list before trying again." : err.message || "Unable to save section.");
    } finally {
      if (sectionId) this.setCardLoading(sectionId, false);
      Auth.setLoading(btn, false);
    }
  },
  openAddSectionForm() {
    const form = document.getElementById("add-section-form");
    form.reset();
    document.getElementById("section-form-mode").value = "add";
    document.getElementById("section-form-id").value = "";
    document.getElementById("section-form-title").textContent = "Add School Section";
    form.querySelector(".btn-primary .btn-label").textContent = "Create Section";
    Modal.open("modal-add-section");
  },
  openEditSectionForm(sec) {
    const form = document.getElementById("add-section-form");
    document.getElementById("section-form-mode").value = "edit";
    document.getElementById("section-form-id").value = sec.SectionID;
    document.getElementById("section-form-title").textContent = "Edit School Section";
    document.getElementById("f-grade-level").value = sec.GradeLevel || "";
    document.getElementById("f-section-name").value = sec.SectionName || "";
    form.querySelector(".btn-primary .btn-label").textContent = "Save Changes";
    Modal.open("modal-add-section");
  },
  async removeSection(sec) {
    const count = STATE.students.filter(student => student.SectionID === sec.SectionID).length;
    const message = count > 0
      ? `This section has ${count} enrolled student${count === 1 ? "" : "s"}. It will be archived instead of deleted. Continue?`
      : `Remove ${sec.GradeLevel} - ${sec.SectionName}?`;
    if (!window.confirm(message)) return;
    this.setCardLoading(sec.SectionID, true, "Updating section");
    try {
      const result = await Api.call("removeSection", { SectionID: sec.SectionID });
      const index = STATE.sections.findIndex(section => section.SectionID === sec.SectionID);
      if (result.Removed) STATE.sections.splice(index, 1);
      else if (index !== -1) STATE.sections[index] = result;
      Store.set("sections", STATE.sections);
      this.render();
      Dashboard.render();
      Toast.success(result.Message || "Section updated.");
    } catch (err) {
      Toast.error(err.message || "Unable to remove section.");
    } finally {
      this.setCardLoading(sec.SectionID, false);
    }
  }
};

/* ================= 12. STUDENTS / ENROLLMENT MODULE ================= */
const Students = {
  init() {
    document.getElementById("add-student-btn").addEventListener("click", () => this.openStudentModal("add"));
    document.getElementById("student-form").addEventListener("submit", this.handleSaveStudent.bind(this));
    document.getElementById("enrollment-search").addEventListener("input", () => this.renderEnrollmentTable());
    document.querySelectorAll("#enrollment-table th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const field = th.dataset.sort;
        if (STATE.enrollmentSort.field === field) {
          STATE.enrollmentSort.dir = STATE.enrollmentSort.dir === "asc" ? "desc" : "asc";
        } else {
          STATE.enrollmentSort = { field, dir: "asc" };
        }
        this.renderEnrollmentTable();
      });
    });

    // Action modal buttons
    document.getElementById("action-view-btn").addEventListener("click", () => this.viewStudent());
    document.getElementById("action-edit-btn").addEventListener("click", () => this.editStudent());
    document.getElementById("action-transfer-btn").addEventListener("click", () => this.openTransferModal());
    document.getElementById("confirm-transfer-btn").addEventListener("click", () => this.confirmTransfer());
  },

  sectionLabel(sectionId) {
    const sec = STATE.sections.find(s => s.SectionID === sectionId);
    return sec ? `${sec.GradeLevel}-${sec.SectionName}` : "Unassigned";
  },

  renderEnrollmentTable() {
    const query = document.getElementById("enrollment-search").value;
    let list = STATE.students.filter(s => studentMatchesSearch(s, query));
    list = sortStudents(list, STATE.enrollmentSort.field, STATE.enrollmentSort.dir);
    const tbody = document.getElementById("enrollment-tbody");
    tbody.innerHTML = "";
    document.getElementById("enrollment-empty").hidden = list.length !== 0;
    list.forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.StudentID)}</td>
        <td>${escapeHtml(s.LastName)}</td>
        <td>${escapeHtml(s.FirstName)}</td>
        <td>${escapeHtml(s.MiddleName)}</td>
        <td>${escapeHtml(s.Gender)}</td>
        <td>${escapeHtml(this.sectionLabel(s.SectionID))}</td>
        <td><span class="status-badge ${s.Status === "Inactive" ? "badge-danger" : "badge-success"}">${escapeHtml(s.Status || "Active")}</span></td>
        <td><button class="table-action-btn" data-action-id="${escapeHtml(s.StudentID)}">Action</button></td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("[data-action-id]").forEach(btn => {
      btn.addEventListener("click", () => this.openActionModal(btn.dataset.actionId));
    });
  },

  openStudentModal(mode, student = null) {
    document.getElementById("student-form-mode").value = mode;
    document.getElementById("student-modal-title").textContent = mode === "edit" ? "Edit Student" : "Add Student";
    const form = document.getElementById("student-form");
    form.reset();
    document.getElementById("f-student-id").disabled = mode === "edit";
    if (student) {
      document.getElementById("f-student-id").value = student.StudentID;
      document.getElementById("f-last-name").value = student.LastName;
      document.getElementById("f-first-name").value = student.FirstName;
      document.getElementById("f-middle-name").value = student.MiddleName || "";
      document.getElementById("f-gender").value = student.Gender;
      document.getElementById("f-dob").value = student.DateOfBirth || "";
      document.getElementById("f-contact").value = student.ContactNumber || "";
      document.getElementById("f-address").value = student.Address || "";
      document.getElementById("f-section").value = student.SectionID || "";
      form.dataset.editingId = student.StudentID;
    } else {
      delete form.dataset.editingId;
    }
    Modal.open("modal-student");
  },

  async handleSaveStudent(e) {
    e.preventDefault();
    const mode = document.getElementById("student-form-mode").value;
    const btn = e.target.querySelector("button[type=submit]");
    const payload = {
      StudentID: document.getElementById("f-student-id").value.trim(),
      LastName: document.getElementById("f-last-name").value.trim(),
      FirstName: document.getElementById("f-first-name").value.trim(),
      MiddleName: document.getElementById("f-middle-name").value.trim(),
      Gender: document.getElementById("f-gender").value,
      DateOfBirth: document.getElementById("f-dob").value,
      ContactNumber: document.getElementById("f-contact").value.trim(),
      Address: document.getElementById("f-address").value.trim(),
      SectionID: document.getElementById("f-section").value
    };
    if (!payload.StudentID || !payload.LastName || !payload.FirstName || !payload.Gender || !payload.SectionID) {
      Toast.warning("Please fill in all required fields.");
      return;
    }
    Auth.setLoading(btn, true);
    try {
      let savedStudent;
      let confirmedAfterRetry = false;
      if (mode === "add") {
        if (STATE.students.some(s => s.StudentID === payload.StudentID)) {
          throw new Error("Student ID already exists.");
        }
        try {
          savedStudent = await Api.call("addStudent", payload);
        } catch (apiError) {
          let snapshot;
          try { snapshot = await Api.call("getSnapshot", {}); }
          catch (_) { throw apiError; }
          savedStudent = (snapshot.students || []).find(student =>
            String(student.StudentID) === String(payload.StudentID) &&
            student.FirstName === payload.FirstName && student.LastName === payload.LastName &&
            student.MiddleName === payload.MiddleName && student.Gender === payload.Gender &&
            String(student.SectionID) === String(payload.SectionID));
          if (!savedStudent) throw apiError;
          STATE.students = snapshot.students || [];
          confirmedAfterRetry = true;
        }
        if (!STATE.students.some(student => String(student.StudentID) === String(savedStudent.StudentID))) STATE.students.push(savedStudent);
      } else {
        try {
          savedStudent = await Api.call("updateStudent", payload);
        } catch (apiError) {
          let snapshot;
          try { snapshot = await Api.call("getSnapshot", {}); }
          catch (_) { throw apiError; }
          savedStudent = (snapshot.students || []).find(student => String(student.StudentID) === String(payload.StudentID) &&
            student.FirstName === payload.FirstName && student.LastName === payload.LastName && student.SectionID === payload.SectionID);
          if (!savedStudent) throw apiError;
          STATE.students = snapshot.students || [];
          confirmedAfterRetry = true;
        }
        const idx = STATE.students.findIndex(s => s.StudentID === payload.StudentID);
        if (idx !== -1) STATE.students[idx] = savedStudent;
      }
      Store.set("students", STATE.students);
      Modal.close("modal-student");
      try {
        this.renderAll();
        Toast.success(confirmedAfterRetry ? "Student saved successfully. The response was delayed; server data is confirmed." : mode === "add" ? "Student added successfully." : "Student updated successfully.");
      } catch (renderError) {
        console.error("Student saved, but the dashboard could not refresh.", renderError);
        Toast.warning("Student saved. Refresh the page to update the dashboard.");
      }
    } catch (err) {
      Toast.error(err.name === "ApiTimeoutError" ? "The student save could not be confirmed. Refresh the list before trying again." : err.message || "Unable to save student.");
    } finally {
      Auth.setLoading(btn, false);
    }
  },

  openActionModal(studentId) {
    const student = STATE.students.find(s => String(s.StudentID) === String(studentId));
    if (!student) return;
    STATE.currentActionStudent = student;
    document.getElementById("action-modal-student-name").textContent =
      `${student.LastName}, ${student.FirstName} (${student.StudentID})`;
    Modal.open("modal-action");
  },

  viewStudent() {
    const s = STATE.currentActionStudent;
    if (!s) return;
    Modal.close("modal-action");
    const body = document.getElementById("view-modal-body");
    body.innerHTML = [
      ["Student ID", s.StudentID],
      ["Last Name", s.LastName],
      ["First Name", s.FirstName],
      ["Middle Name", s.MiddleName || "-"],
      ["Gender", s.Gender],
      ["Date of Birth", s.DateOfBirth || "-"],
      ["Contact Number", s.ContactNumber || "-"],
      ["Address", s.Address || "-"],
      ["Section", this.sectionLabel(s.SectionID)],
      ["Status", s.Status || "Active"]
    ].map(([k, v]) => `<div class="view-row"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`).join("");
    Modal.open("modal-view");
  },

  editStudent() {
    const s = STATE.currentActionStudent;
    if (!s) return;
    Modal.close("modal-action");
    this.openStudentModal("edit", s);
  },

  openTransferModal() {
    const s = STATE.currentActionStudent;
    if (!s) return;
    Modal.close("modal-action");
    document.getElementById("transfer-current-section").textContent = this.sectionLabel(s.SectionID);
    const select = document.getElementById("transfer-new-section");
    select.innerHTML = STATE.sections
      .filter(sec => sec.SectionID !== s.SectionID && String(sec.Status || "Active").toLowerCase() === "active")
      .map(sec => `<option value="${sec.SectionID}">${escapeHtml(sec.GradeLevel)} - ${escapeHtml(sec.SectionName)}</option>`)
      .join("");
    Modal.open("modal-transfer");
  },

  async confirmTransfer() {
    const s = STATE.currentActionStudent;
    const newSectionId = document.getElementById("transfer-new-section").value;
    if (!s || !newSectionId) { Toast.warning("Please select a section."); return; }
    const btn = document.getElementById("confirm-transfer-btn");
    Auth.setLoading(btn, true);
    try {
      await Api.call("transferStudent", { StudentID: s.StudentID, NewSectionID: newSectionId });
      // Update the student's section locally; a transfer updates the existing
      // record instead of creating a duplicate, so the student is
      // automatically removed from the old section's list and added to the
      // new one on next render.
      const idx = STATE.students.findIndex(st => st.StudentID === s.StudentID);
      if (idx !== -1) STATE.students[idx].SectionID = newSectionId;
      Store.set("students", STATE.students);
      Modal.close("modal-transfer");
      const newSec = STATE.sections.find(sec => sec.SectionID === newSectionId);
      Toast.success(`Student successfully transferred to ${newSec ? newSec.GradeLevel + "-" + newSec.SectionName : "new section"}.`);
      this.renderAll();
      if (STATE.currentSection) Sections.renderSectionModalTable();
    } catch (err) {
      Toast.error(err.message || "Unable to transfer student.");
    } finally {
      Auth.setLoading(btn, false);
    }
  },

  renderAll() {
    this.renderEnrollmentTable();
    Sections.render();
    Dashboard.render();
    Grading.populateStudentsIfSectionSelected();
  }
};

/* ================= 13. GRADING MODULE ================= */
const Grading = {
  init() {
    document.getElementById("grading-section-select").addEventListener("change", (e) => {
      this.loadSection(e.target.value);
    });
    document.getElementById("save-grades-btn").addEventListener("click", () => this.saveGrades());
    document.getElementById("grading-search").addEventListener("input", () => this.filterRows());
  },
  get subjects() {
    return (STATE.settings.Subjects || "").split(",").map(s => s.trim()).filter(Boolean);
  },
  loadSection(sectionId) {
    const saveBtn = document.getElementById("save-grades-btn");
    const emptyEl = document.getElementById("grading-empty");
    if (!sectionId) {
      document.getElementById("grading-tbody").innerHTML = "";
      document.getElementById("grading-thead").innerHTML = "<tr><th>Student</th></tr>";
      emptyEl.hidden = false;
      emptyEl.textContent = "Select a school section to begin grading.";
      saveBtn.disabled = true;
      return;
    }
    STATE.currentGradingSectionId = sectionId;
    const students = sortStudents(STATE.students.filter(s => s.SectionID === sectionId), "LastName", "asc");
    const subjects = this.subjects;

    const thead = document.getElementById("grading-thead");
    thead.innerHTML = "<tr><th>Student</th>" + subjects.map(sub => `<th>${escapeHtml(sub)}</th>`).join("") + "<th>Average</th><th>Remarks</th></tr>";

    const tbody = document.getElementById("grading-tbody");
    tbody.innerHTML = "";
    emptyEl.hidden = students.length !== 0;
    if (students.length === 0) emptyEl.textContent = "No students in this section yet.";
    saveBtn.disabled = students.length === 0;

    students.forEach(s => {
      const tr = document.createElement("tr");
      tr.dataset.studentId = s.StudentID;
      tr.dataset.search = `${s.StudentID} ${s.FirstName} ${s.LastName} ${s.MiddleName || ""}`.toLowerCase();
      const cells = subjects.map(sub => {
        const g = this.getGrade(s.StudentID, sub);
        return `<td><input type="number" min="0" max="100" class="grade-input" data-subject="${escapeHtml(sub)}" value="${g !== null && g !== undefined ? g : ""}" /></td>`;
      }).join("");
      tr.innerHTML = `<td>${escapeHtml(s.LastName)}, ${escapeHtml(s.FirstName)}</td>${cells}<td class="avg-cell">-</td><td class="remarks-cell">-</td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("input.grade-input").forEach(input => {
      input.addEventListener("input", () => this.recalcRow(input.closest("tr")));
      this.recalcRow(document.querySelector(`tr[data-student-id="${CSS.escape(input.closest("tr").dataset.studentId)}"]`));
    });
    this.filterRows();
  },
  filterRows() {
    const query = (document.getElementById("grading-search")?.value || "").trim().toLowerCase();
    const rows = [...document.querySelectorAll("#grading-tbody tr")];
    rows.forEach(row => {
      row.hidden = !row.dataset.search.includes(query);
    });
    const empty = document.getElementById("grading-empty");
    if (STATE.currentGradingSectionId && rows.length) {
      const hasMatch = rows.some(row => !row.hidden);
      empty.hidden = hasMatch;
      if (!hasMatch) empty.textContent = "No students match your search.";
    }
  },
  getGrade(studentId, subject) {
    const rec = STATE.grades.find(g => g.StudentID === studentId && g.Subject === subject && g.SectionID === STATE.currentGradingSectionId);
    return rec ? rec.Grade : null;
  },
  recalcRow(tr) {
    if (!tr) return;
    const inputs = [...tr.querySelectorAll("input.grade-input")];
    let sum = 0, count = 0, hasInvalid = false, hasEmpty = false;
    inputs.forEach(inp => {
      const val = inp.value.trim();
      if (val === "") { hasEmpty = true; inp.classList.remove("invalid"); return; }
      const num = Number(val);
      if (isNaN(num) || num < 0 || num > 100) {
        inp.classList.add("invalid");
        hasInvalid = true;
      } else {
        inp.classList.remove("invalid");
        sum += num; count++;
      }
    });
    const avgCell = tr.querySelector(".avg-cell");
    const remarksCell = tr.querySelector(".remarks-cell");
    if (hasInvalid) {
      avgCell.textContent = "-";
      remarksCell.innerHTML = `<span class="status-badge badge-danger">Invalid</span>`;
      return;
    }
    if (hasEmpty || count < inputs.length) {
      avgCell.textContent = "Pending";
      remarksCell.innerHTML = `<span class="status-badge badge-warning">Pending</span>`;
      return;
    }
    const avg = sum / inputs.length;
    avgCell.textContent = avg.toFixed(2);
    const passing = Number(STATE.settings.PassingGrade) || 75;
    const passed = avg >= passing;
    remarksCell.innerHTML = `<span class="status-badge ${passed ? "badge-success" : "badge-danger"}">${passed ? "Passed" : "Failed"}</span>`;
  },
  async saveGrades() {
    const sectionId = STATE.currentGradingSectionId;
    if (!sectionId) return;
    const rows = [...document.querySelectorAll("#grading-tbody tr")];
    const invalid = rows.some(tr => [...tr.querySelectorAll("input.grade-input")].some(i => i.classList.contains("invalid")));
    if (invalid) {
      Toast.error("Grade must be between 0 and 100.");
      return;
    }
    const btn = document.getElementById("save-grades-btn");
    Auth.setLoading ? null : null;
    btn.disabled = true;
    const records = [];
    rows.forEach(tr => {
      const studentId = tr.dataset.studentId;
      tr.querySelectorAll("input.grade-input").forEach(inp => {
        const val = inp.value.trim();
        if (val === "") return;
        records.push({ StudentID: studentId, SectionID: sectionId, Subject: inp.dataset.subject, Grade: Number(val) });
      });
    });
    try {
      await Api.call("saveGrades", { records });
      // Merge into local grade cache
      records.forEach(rec => {
        const idx = STATE.grades.findIndex(g => g.StudentID === rec.StudentID && g.Subject === rec.Subject && g.SectionID === rec.SectionID);
        if (idx !== -1) STATE.grades[idx].Grade = rec.Grade;
        else STATE.grades.push(rec);
      });
      Store.set("grades", STATE.grades);
      Dashboard.render();
      Toast.success("Grades saved successfully.");
    } catch (err) {
      Toast.error(err.message || "Unable to save grades.");
    } finally {
      btn.disabled = false;
    }
  },
  populateStudentsIfSectionSelected() {
    const sel = document.getElementById("grading-section-select");
    if (sel.value) this.loadSection(sel.value);
  }
};

/* ================= 14. SETTINGS MODULE ================= */
const SettingsModule = {
  init() {
    document.getElementById("save-settings-btn").addEventListener("click", this.save.bind(this));
  },
  renderForm() {
    document.getElementById("settings-system-title").value = STATE.settings.SystemTitle || "";
    document.getElementById("settings-school-name").value = STATE.settings.SchoolName || "";
    document.getElementById("settings-school-year").value = STATE.settings.SchoolYear || "";
    document.getElementById("settings-semester").value = STATE.settings.Semester || "1st";
    document.getElementById("settings-subjects").value = STATE.settings.Subjects || "";
    document.getElementById("settings-passing-grade").value = STATE.settings.PassingGrade || 75;
  },
  applyToUI() {
    const title = STATE.settings.SystemTitle || "School Enrollment Management System";
    document.title = title;
    const loginTitle = document.getElementById("login-system-title");
    const sidebarTitle = document.getElementById("sidebar-system-title");
    if (loginTitle) loginTitle.textContent = title;
    if (sidebarTitle) sidebarTitle.textContent = title;
  },
  async save() {
    const btn = document.getElementById("save-settings-btn");
    const payload = {
      SystemTitle: document.getElementById("settings-system-title").value.trim(),
      SchoolName: document.getElementById("settings-school-name").value.trim(),
      SchoolYear: document.getElementById("settings-school-year").value.trim(),
      Semester: document.getElementById("settings-semester").value,
      Subjects: document.getElementById("settings-subjects").value.trim(),
      PassingGrade: Number(document.getElementById("settings-passing-grade").value) || 75
    };
    Auth.setLoading(btn, true);
    try {
      const saved = await Api.call("updateSettings", payload);
      STATE.settings = { ...STATE.settings, ...saved };
      Store.set("settings", STATE.settings);
      this.applyToUI();
      Toast.success("Settings saved successfully.");
    } catch (err) {
      Toast.error(err.message || "Unable to save settings.");
    } finally {
      Auth.setLoading(btn, false);
    }
  }
};

/* ================= 15. PRIVACY POLICY MODULE ================= */
const PrivacyPolicy = {
  html() {
    return `
      <h3>What Information We Collect</h3>
      <p>This system collects student information (name, gender, date of birth, contact details, address, and school section) entered by school administrators, and basic login/session information (username and a session token) used to keep administrators signed in.</p>
      <h3>How Information Is Stored</h3>
      <p>Student, section, grade, enrollment request, account, announcement, and settings records are stored in a Google Sheets spreadsheet that acts as the system's database. Only the Google Apps Script backend communicates with that spreadsheet.</p>
      <h3>Local Storage Usage</h3>
      <p>This application does not use browser cookies. It uses browser LocalStorage for the signed-in session and an administrator-side convenience cache of school records. Students can access their own enrollment information and announcements for their assigned section only.</p>
      <h3>Why Information Is Collected</h3>
      <p>Information is collected solely to operate core school functions: enrolling students, organizing them into sections, recording grades, and giving administrators an authenticated dashboard to manage this data.</p>
      <h3>Data Access</h3>
      <p>Administrators manage school records and enrollment decisions. Student accounts can view their own request or enrollment status and announcements for their assigned section. The backend checks account roles for protected actions.</p>
      <h3>Data Retention</h3>
      <p>Records remain in the Google Sheets database until an administrator edits or removes them. Enrollment requests and announcements are retained for administrative review until removed.</p>
      <h3>Security Precautions</h3>
      <p>Requests are validated on the server, Student IDs are checked for uniqueness, grade values are range-checked, and the frontend avoids storing plaintext credentials unnecessarily. No system can guarantee absolute security, and this project does not claim certification under any specific data-protection law.</p>
      <h3>Administrator Responsibilities</h3>
      <p>Administrators are responsible for keeping login credentials confidential and for entering accurate student data.</p>
    `;
  },
  init() {
    const policyContent = document.getElementById("privacy-policy-content");
    const modalContent = document.getElementById("privacy-modal-content");
    const privacyButton = document.getElementById("open-privacy-from-login");
    if (policyContent) policyContent.innerHTML = this.html();
    if (modalContent) modalContent.innerHTML = this.html();
    if (privacyButton) privacyButton.addEventListener("click", () => Modal.open("modal-privacy"));
  }
};

/* ================= 16. POLLING MANAGER ================= */
const Polling = {
  inFlight: false,
  start() {
    this.stop();
    STATE.pollTimer = setInterval(() => this.tick(), CONFIG.POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  },
  stop() {
    if (STATE.pollTimer) clearInterval(STATE.pollTimer);
    STATE.pollTimer = null;
  },
  onVisibilityChange() {
    if (document.visibilityState === "visible") {
      Polling.tick();
    }
  },
  isUserTyping() {
    const active = document.activeElement;
    return active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
  },
  async tick() {
    if (this.inFlight || document.visibilityState !== "visible") return;
    if (this.isUserTyping()) return; // don't interrupt the administrator while typing
    if (!STATE.session) return;
    this.inFlight = true;
    const requestWriteVersion = Api.writeVersion;
    try {
      const data = await Api.call("getSnapshot", {});
      if (requestWriteVersion !== Api.writeVersion) return;
      Connection.setOnline(true);
      let changed = false;
      if (JSON.stringify(data.students) !== JSON.stringify(STATE.students)) {
        STATE.students = data.students; Store.set("students", data.students); changed = true;
      }
      if (JSON.stringify(data.sections) !== JSON.stringify(STATE.sections)) {
        STATE.sections = data.sections; Store.set("sections", data.sections); changed = true;
      }
      if (JSON.stringify(data.grades) !== JSON.stringify(STATE.grades)) {
        STATE.grades = data.grades; Store.set("grades", data.grades); changed = true;
      }
      if (JSON.stringify(data.settings) !== JSON.stringify(STATE.settings)) {
        STATE.settings = data.settings || STATE.settings;
        Store.set("settings", STATE.settings);
        SettingsModule.applyToUI();
        changed = true;
      }
      if (changed) {
        App.renderAll();
      }
      AdminConsole.load(data);
    } catch (err) {
      Connection.setOnline(false);
    } finally {
      this.inFlight = false;
    }
  }
};

/* ================= 17. CONNECTION STATUS ================= */
const Connection = {
  setOnline(isOnline) {
    if (STATE.isOnline === isOnline) return;
    STATE.isOnline = isOnline;
    const el = document.getElementById("conn-status");
    if (isOnline) {
      el.textContent = "Online";
      el.className = "conn-status conn-online";
      Toast.info("Connection restored. Data synchronized.");
    } else {
      el.textContent = "Offline (cached)";
      el.className = "conn-status conn-offline";
      Toast.warning("Unable to connect to the server. Using cached data.");
    }
  }
};

/* ================= 18. APP BOOTSTRAP ================= */
const App = {
  showLogin() {
    const loginScreen = document.getElementById("login-screen");
    const appShell = document.getElementById("app-shell");
    if (loginScreen) loginScreen.hidden = false;
    if (appShell) appShell.hidden = true;
  },
  async enterApp() {
    if (!window.IS_ADMIN_PAGE) {
      window.location.href = "admin.html";
      return;
    }
    const loginScreen = document.getElementById("login-screen");
    const appShell = document.getElementById("app-shell");
    if (loginScreen) loginScreen.hidden = true;
    if (appShell) appShell.hidden = false;

    // Load from cache immediately for instant UI, then refresh from server.
    STATE.students = Store.get("students", []);
    STATE.sections = Store.get("sections", []);
    STATE.grades = Store.get("grades", []);
    STATE.settings = Store.get("settings", STATE.settings);
    this.renderAll();
    SettingsModule.applyToUI();

    try {
      const data = await Api.call("getSnapshot", {});
      STATE.students = data.students || [];
      STATE.sections = data.sections || [];
      STATE.grades = data.grades || [];
      STATE.settings = data.settings || STATE.settings;
      Store.set("students", STATE.students);
      Store.set("sections", STATE.sections);
      Store.set("grades", STATE.grades);
      Store.set("settings", STATE.settings);
      Connection.setOnline(true);
      this.renderAll();
      SettingsModule.applyToUI();
      AdminConsole.load(data);
    } catch (err) {
      Connection.setOnline(false);
      Toast.warning("Unable to connect to the server. Using cached data.");
    }

    Polling.start();
  },
  renderAll() {
    Sections.render();
    Students.renderEnrollmentTable();
    Dashboard.render();
    SettingsModule.renderForm();
    Grading.populateStudentsIfSectionSelected();
  }
};

const StudentApp = {
  data: null,
  refreshTimer: null,
  refreshing: false,
  init() {
    document.querySelectorAll("[data-student-page]").forEach(button => {
      button.addEventListener("click", () => this.goTo(button.dataset.studentPage));
    });
    document.querySelectorAll("[data-student-page-link]").forEach(button => {
      button.addEventListener("click", () => this.goTo(button.dataset.studentPageLink));
    });
    document.getElementById("student-menu-btn").addEventListener("click", () => {
      document.getElementById("student-sidebar").classList.toggle("open");
      document.getElementById("student-sidebar-overlay").classList.toggle("show");
    });
    document.getElementById("student-sidebar-overlay").addEventListener("click", () => this.closeSidebar());
    document.getElementById("start-enrollment-btn").addEventListener("click", () => this.openEnrollmentForm());
    document.getElementById("student-enrollment-btn").addEventListener("click", () => this.openEnrollmentForm());
    document.getElementById("student-enrollment-form").addEventListener("submit", this.submitEnrollment.bind(this));
    document.getElementById("student-logout-btn").addEventListener("click", () => this.logout());
  },
  async enter() {
    document.getElementById("student-app-shell").hidden = false;
    document.getElementById("student-account-label").textContent = STATE.session.username;
    await this.refresh();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") this.refresh();
    }, 30000);
  },
  closeSidebar() {
    document.getElementById("student-sidebar").classList.remove("open");
    document.getElementById("student-sidebar-overlay").classList.remove("show");
  },
  goTo(page) {
    document.querySelectorAll("#student-app-shell .page").forEach(section => section.classList.remove("active"));
    document.querySelectorAll("[data-student-page]").forEach(button => button.classList.toggle("active", button.dataset.studentPage === page));
    document.getElementById("student-page-" + page).classList.add("active");
    const selected = document.querySelector(`[data-student-page="${page}"] span`);
    document.getElementById("student-topbar-title").textContent = selected ? selected.textContent : "Overview";
    this.closeSidebar();
  },
  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      this.data = await Api.call("getStudentDashboard", {});
      this.render();
    } catch (err) {
      Toast.error(err.message || "Unable to load your enrollment information.");
    } finally {
      this.refreshing = false;
    }
  },
  render() {
    const { student, request, section, announcements = [] } = this.data || {};
    const firstName = student?.FirstName || request?.FirstName || STATE.session.username;
    document.getElementById("student-welcome-name").textContent = "Welcome, " + firstName;
    const statusTitle = student ? "Enrolled" : request?.Status || "Not submitted";
    const statusBadge = document.getElementById("student-status-badge");
    document.getElementById("student-status-title").textContent = statusTitle;
    statusBadge.textContent = student ? "Active student" : statusTitle;
    statusBadge.className = "status-badge " + (student ? "badge-success" : request?.Status === "Pending" ? "badge-warning" : request?.Status === "Rejected" ? "badge-danger" : "badge-info");
    document.getElementById("student-status-copy").textContent = student
      ? "Your enrollment is approved. Check your section announcements for schedule updates."
      : request?.Status === "Pending" ? "Your form has been received and is waiting for administrator review."
        : request?.Status === "Rejected" ? "Your previous request was not approved. Update your information and submit again."
          : "Complete your enrollment form for an administrator to review.";
    const canSubmit = !student && request?.Status !== "Pending" && request?.Status !== "Approved";
    document.getElementById("start-enrollment-btn").hidden = !canSubmit;
    document.getElementById("student-enrollment-btn").hidden = !canSubmit;
    const sectionPanel = document.getElementById("student-assigned-section");
    sectionPanel.hidden = !student;
    if (student) sectionPanel.innerHTML = `Assigned school section<strong>${escapeHtml(section ? `${section.GradeLevel} - ${section.SectionName}` : "Section assigned")}</strong>`;
    const statusPanel = document.getElementById("student-enrollment-status");
    statusPanel.innerHTML = `<div class="panel-heading"><div><p class="stat-label">CURRENT STATUS</p><h2>${escapeHtml(statusTitle)}</h2></div><span class="status-badge ${student ? "badge-success" : request?.Status === "Pending" ? "badge-warning" : request?.Status === "Rejected" ? "badge-danger" : "badge-info"}">${escapeHtml(student ? "Active student" : statusTitle)}</span></div><p>${escapeHtml(student ? `Student ID: ${student.StudentID}` : request?.Status === "Pending" ? `Submitted ${request.SubmittedAt || ""}. The administrator will assign your school section.` : request?.Status === "Rejected" ? request.AdminNotes || "You may update your information and submit again." : "No enrollment form has been submitted yet.")}</p>${student && section ? `<div class="assigned-section">Assigned school section<strong>${escapeHtml(`${section.GradeLevel} - ${section.SectionName}`)}</strong></div>` : ""}`;
    document.getElementById("student-announcement-section").textContent = section ? `${section.GradeLevel} - ${section.SectionName}` : "Available after your enrollment is approved.";
    this.renderAnnouncements(announcements);
  },
  renderAnnouncements(announcements) {
    const list = document.getElementById("student-announcements-list");
    list.innerHTML = "";
    document.getElementById("student-announcements-empty").hidden = announcements.length !== 0;
    announcements.forEach(item => list.appendChild(this.announcementElement(item)));
    const next = announcements.find(item => !item.ScheduleDate || String(item.ScheduleDate) >= new Date().toISOString().slice(0, 10));
    const nextContainer = document.getElementById("student-next-event");
    nextContainer.innerHTML = next ? `<h3>${escapeHtml(next.Title)}</h3><p>${escapeHtml(next.ScheduleDate)}${next.StartTime ? ` · ${escapeHtml(next.StartTime)}` : ""}</p><p>${escapeHtml(next.Location || "Location to be announced")}</p>` : `<p class="muted">No schedule has been announced for your section yet.</p>`;
  },
  announcementElement(item) {
    const article = document.createElement("article");
    article.className = "announcement-item";
    const time = [item.StartTime, item.EndTime].filter(Boolean).join(" - ");
    article.innerHTML = `<h4>${escapeHtml(item.Title)}</h4><div class="announcement-meta"><span>${escapeHtml(item.ScheduleDate || "Date to be announced")}</span>${time ? `<span>${escapeHtml(time)}</span>` : ""}${item.Location ? `<span>${escapeHtml(item.Location)}</span>` : ""}</div><p>${escapeHtml(item.Message)}</p>`;
    return article;
  },
  openEnrollmentForm() {
    if (!this.data?.request || this.data.request.Status === "Rejected") {
      const request = this.data?.request;
      if (request) {
        ["student-id", "last-name", "first-name", "middle-name", "gender", "dob", "contact", "address"].forEach((suffix, index) => {
          const keys = ["StudentID", "LastName", "FirstName", "MiddleName", "Gender", "DateOfBirth", "ContactNumber", "Address"];
          const input = document.getElementById("request-" + suffix);
          if (input) input.value = request[keys[index]] || "";
        });
      }
      Modal.open("modal-student-enrollment");
    }
  },
  async submitEnrollment(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const error = document.getElementById("student-enrollment-error");
    error.hidden = true;
    const payload = {
      StudentID: document.getElementById("request-student-id").value.trim(),
      LastName: document.getElementById("request-last-name").value.trim(),
      FirstName: document.getElementById("request-first-name").value.trim(),
      MiddleName: document.getElementById("request-middle-name").value.trim(),
      Gender: document.getElementById("request-gender").value,
      DateOfBirth: document.getElementById("request-dob").value,
      ContactNumber: document.getElementById("request-contact").value.trim(),
      Address: document.getElementById("request-address").value.trim()
    };
    Auth.setLoading(button, true);
    try {
      await Api.call("submitEnrollment", payload);
      form.reset();
      Modal.close("modal-student-enrollment");
      Toast.success("Enrollment form sent to the administrator.");
      await this.refresh();
    } catch (err) {
      error.textContent = err.message || "Unable to submit enrollment form.";
      error.hidden = false;
    } finally {
      Auth.setLoading(button, false);
    }
  },
  async logout() {
    if (!window.confirm("Are you sure you want to log out?")) return;
    const overlay = document.getElementById("student-logout-loading");
    overlay.hidden = false;
    await new Promise(resolve => setTimeout(resolve, 650));
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    STATE.session = null;
    Store.remove("session");
    window.location.href = "index.html";
  }
};

const AdminConsole = {
  init() {
    document.getElementById("request-search").addEventListener("input", () => this.renderRequests());
    document.getElementById("users-search").addEventListener("input", () => this.renderUsers());
    document.getElementById("requests-tbody").addEventListener("click", event => {
      const button = event.target.closest("[data-review-id]");
      if (button) this.openReview(button.dataset.reviewId);
    });
    document.getElementById("approve-request-btn").addEventListener("click", () => this.review("Approve"));
    document.getElementById("reject-request-btn").addEventListener("click", () => this.review("Reject"));
    document.getElementById("users-tbody").addEventListener("click", event => {
      const button = event.target.closest("[data-reset-user]");
      if (button) this.openPasswordReset(button.dataset.resetUser);
    });
    document.getElementById("reset-password-form").addEventListener("submit", this.resetPassword.bind(this));
    document.getElementById("announcement-form").addEventListener("submit", this.postAnnouncement.bind(this));
    document.getElementById("announcements-list").addEventListener("click", event => {
      const button = event.target.closest("[data-remove-announcement]");
      if (button) this.removeAnnouncement(button.dataset.removeAnnouncement);
    });
  },
  load(snapshot) {
    if (!snapshot) return;
    STATE.users = snapshot.adminUsers || [];
    STATE.enrollmentRequests = snapshot.enrollmentRequests || [];
    STATE.announcements = snapshot.announcements || [];
    this.render();
  },
  render() {
    Sections.populateSectionDropdowns();
    this.renderRequests();
    this.renderUsers();
    this.renderAnnouncements();
    document.getElementById("stat-user-accounts").textContent = STATE.users.length;
    document.getElementById("stat-pending-requests").textContent = STATE.enrollmentRequests.filter(item => item.Status === "Pending").length;
  },
  renderRequests() {
    const query = document.getElementById("request-search").value.trim().toLowerCase();
    const usersById = new Map(STATE.users.map(user => [user.UserID, user.Username]));
    const rows = STATE.enrollmentRequests.filter(item => `${item.FirstName} ${item.LastName} ${item.StudentID} ${usersById.get(item.UserID) || ""}`.toLowerCase().includes(query));
    const tbody = document.getElementById("requests-tbody");
    tbody.innerHTML = "";
    document.getElementById("requests-empty").hidden = rows.length !== 0;
    rows.forEach(item => {
      const tr = document.createElement("tr");
      const action = item.Status === "Pending" ? `<button class="table-action-btn" data-review-id="${escapeHtml(item.RequestID)}">Review</button>` : "-";
      tr.innerHTML = `<td>${escapeHtml(`${item.LastName}, ${item.FirstName}`)}<small class="table-subtext">${escapeHtml(usersById.get(item.UserID) || "")}</small></td><td>${escapeHtml(item.StudentID || "Not assigned")}</td><td>${escapeHtml(item.ContactNumber || "-")}</td><td>${escapeHtml(item.SubmittedAt || "")}</td><td><span class="status-badge ${item.Status === "Pending" ? "badge-warning" : item.Status === "Approved" ? "badge-success" : "badge-danger"}">${escapeHtml(item.Status)}</span></td><td>${action}</td>`;
      tbody.appendChild(tr);
    });
  },
  openReview(requestId) {
    const request = STATE.enrollmentRequests.find(item => item.RequestID === requestId);
    if (!request) return;
    STATE.currentEnrollmentRequest = request;
    Sections.populateSectionDropdowns();
    document.getElementById("review-section").value = "";
    document.getElementById("review-note").value = "";
    document.getElementById("request-review-details").innerHTML = [
      ["Applicant", `${request.FirstName} ${request.MiddleName || ""} ${request.LastName}`], ["Requested ID", request.StudentID || "Not issued"],
      ["Gender", request.Gender], ["Date of birth", request.DateOfBirth || "-"], ["Contact", request.ContactNumber || "-"], ["Address", request.Address || "-"]
    ].map(([label, value]) => `<div>${escapeHtml(label)}<strong>${escapeHtml(value)}</strong></div>`).join("");
    Modal.open("modal-review-request");
  },
  async review(decision) {
    const request = STATE.currentEnrollmentRequest;
    if (!request) return;
    const sectionId = document.getElementById("review-section").value;
    if (decision === "Approve" && !sectionId) {
      Toast.warning("Select a section before approving this request.");
      return;
    }
    const button = document.getElementById(decision === "Approve" ? "approve-request-btn" : "reject-request-btn");
    button.disabled = true;
    if (decision === "Approve") Auth.setLoading(button, true);
    try {
      const result = await Api.call("reviewEnrollmentRequest", {
        RequestID: request.RequestID, Decision: decision, SectionID: sectionId,
        AdminNotes: document.getElementById("review-note").value.trim()
      });
      Modal.close("modal-review-request");
      Toast.success(decision === "Approve" ? `Enrollment approved. Student ID: ${result.StudentID}` : "Enrollment request rejected.");
      const snapshot = await Api.call("getSnapshot");
      STATE.students = snapshot.students || [];
      STATE.sections = snapshot.sections || [];
      STATE.grades = snapshot.grades || [];
      App.renderAll();
      this.load(snapshot);
    } catch (err) {
      Toast.error(err.message || "Unable to review enrollment request.");
    } finally {
      button.disabled = false;
      if (decision === "Approve") Auth.setLoading(button, false);
    }
  },
  renderUsers() {
    const query = document.getElementById("users-search").value.trim().toLowerCase();
    const rows = STATE.users.filter(user => {
      const student = STATE.students.find(item => item.UserID === user.UserID);
      const request = STATE.enrollmentRequests.find(item => item.UserID === user.UserID);
      const studentName = student ? `${student.FirstName} ${student.LastName}` : request ? `${request.FirstName} ${request.LastName}` : "";
      return `${user.Username} ${user.StudentID || ""} ${studentName} ${user.Role}`.toLowerCase().includes(query);
    });
    const tbody = document.getElementById("users-tbody");
    tbody.innerHTML = "";
    document.getElementById("users-empty").hidden = rows.length !== 0;
    rows.forEach(user => {
      const tr = document.createElement("tr");
      const student = STATE.students.find(item => item.UserID === user.UserID);
      const request = STATE.enrollmentRequests.find(item => item.UserID === user.UserID);
      const studentName = student ? `${student.FirstName} ${student.LastName}` : request ? `${request.FirstName} ${request.LastName}` : "-";
      const reset = user.Role === "Student" ? `<button class="table-action-btn" data-reset-user="${escapeHtml(user.UserID)}">Reset password</button>` : "-";
      tr.innerHTML = `<td>${escapeHtml(user.Username)}</td><td>${escapeHtml(studentName)}</td><td>${escapeHtml(user.Role)}</td><td>${escapeHtml(user.StudentID || "-")}</td><td>${escapeHtml(user.Status || "Active")}</td><td>${escapeHtml(user.CreatedAt || "")}</td><td>${reset}</td>`;
      tbody.appendChild(tr);
    });
  },
  openPasswordReset(userId) {
    const user = STATE.users.find(item => item.UserID === userId);
    if (!user) return;
    document.getElementById("reset-user-id").value = user.UserID;
    document.getElementById("reset-user-name").textContent = `Account: ${user.Username}`;
    document.getElementById("reset-password-value").value = "";
    Modal.open("modal-reset-password");
  },
  async resetPassword(e) {
    e.preventDefault();
    const button = e.currentTarget.querySelector("button[type=submit]");
    Auth.setLoading(button, true);
    try {
      await Api.call("resetUserPassword", {
        UserID: document.getElementById("reset-user-id").value,
        Password: document.getElementById("reset-password-value").value
      });
      Modal.close("modal-reset-password");
      Toast.success("Student password was reset.");
    } catch (err) {
      Toast.error(err.message || "Unable to reset password.");
    } finally {
      Auth.setLoading(button, false);
    }
  },
  sectionName(sectionId) {
    const section = STATE.sections.find(item => item.SectionID === sectionId);
    return section ? `${section.GradeLevel} - ${section.SectionName}` : "Unknown section";
  },
  renderAnnouncements() {
    const list = document.getElementById("announcements-list");
    list.innerHTML = "";
    document.getElementById("announcements-empty").hidden = STATE.announcements.length !== 0;
    STATE.announcements.slice().sort((a, b) => String(a.ScheduleDate).localeCompare(String(b.ScheduleDate))).forEach(item => {
      const article = document.createElement("article");
      article.className = "announcement-item";
      const time = [item.StartTime, item.EndTime].filter(Boolean).join(" - ");
      article.innerHTML = `<button class="table-action-btn" data-remove-announcement="${escapeHtml(item.AnnouncementID)}" aria-label="Remove announcement">Remove</button><h4>${escapeHtml(item.Title)}</h4><div class="announcement-meta"><span>${escapeHtml(this.sectionName(item.SectionID))}</span><span>${escapeHtml(item.ScheduleDate || "")}</span>${time ? `<span>${escapeHtml(time)}</span>` : ""}${item.Location ? `<span>${escapeHtml(item.Location)}</span>` : ""}</div><p>${escapeHtml(item.Message)}</p>`;
      list.appendChild(article);
    });
  },
  async postAnnouncement(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const payload = {
      SectionID: document.getElementById("announcement-section").value,
      Title: document.getElementById("announcement-title").value.trim(),
      Message: document.getElementById("announcement-message").value.trim(),
      ScheduleDate: document.getElementById("announcement-date").value,
      StartTime: document.getElementById("announcement-start").value,
      EndTime: document.getElementById("announcement-end").value,
      Location: document.getElementById("announcement-location").value.trim()
    };
    Auth.setLoading(button, true);
    try {
      const created = await Api.call("saveAnnouncement", payload);
      STATE.announcements.push(created);
      form.reset();
      this.renderAnnouncements();
      Toast.success("Announcement posted to the selected section.");
    } catch (err) {
      Toast.error(err.message || "Unable to post announcement.");
    } finally {
      Auth.setLoading(button, false);
    }
  },
  async removeAnnouncement(id) {
    if (!window.confirm("Remove this announcement?")) return;
    try {
      await Api.call("removeAnnouncement", { AnnouncementID: id });
      STATE.announcements = STATE.announcements.filter(item => item.AnnouncementID !== id);
      this.renderAnnouncements();
      Toast.success("Announcement removed.");
    } catch (err) {
      Toast.error(err.message || "Unable to remove announcement.");
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  PrivacyPolicy.init();
  Auth.init();
  if (window.IS_ADMIN_PAGE) {
    Nav.init();
    Sections.init();
    Students.init();
    Grading.init();
    SettingsModule.init();
    AdminConsole.init();
  }
  if (window.IS_STUDENT_PAGE) {
    StudentApp.init();
  }
});
