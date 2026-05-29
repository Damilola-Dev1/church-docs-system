import { db, auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  Timestamp,
  query,
  orderBy,
  enableNetwork,
  disableNetwork,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ══════════════════════════════════════════════════════════════
//  GLOBAL UNHANDLED PROMISE ERROR HANDLER  (BUG FIX med#11)
// ══════════════════════════════════════════════════════════════
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

// ══════════════════════════════════════════════════════════════
//  XSS HELPER  (BUG FIX med#13)
// ══════════════════════════════════════════════════════════════
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ══════════════════════════════════════════════════════════════
//  TOAST NOTIFICATION SYSTEM
// ══════════════════════════════════════════════════════════════
const toastContainer = document.getElementById("toast-container");

function showToast(
  type = "default",
  title = "",
  message = "",
  duration = 4000
) {
  const icons = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    default: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.style.setProperty("--toast-duration", `${duration}ms`);
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.default}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-msg">${message}</div>` : ""}
    </div>
    <button class="toast-close" aria-label="Dismiss">×</button>
    <div class="toast-progress"></div>
  `;

  toastContainer.appendChild(toast);

  const closeBtn = toast.querySelector(".toast-close");
  const dismiss = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%) scale(0.95)";
    toast.style.transition = "all 0.25s ease";
    setTimeout(() => toast.remove(), 260);
  };

  closeBtn.addEventListener("click", dismiss);
  setTimeout(dismiss, duration);
}

// ══════════════════════════════════════════════════════════════
//  OFFLINE BANNER
// ══════════════════════════════════════════════════════════════
const offlineBanner = document.getElementById("offline-banner");
const offlineBannerClose = document.getElementById("offline-banner-close");

let manuallyDismissed = false;

function showOfflineBanner() {
  if (manuallyDismissed) return;
  offlineBanner.classList.remove("hidden");
  document.body.classList.add("offline-active");
}

function hideOfflineBanner() {
  offlineBanner.classList.add("hidden");
  document.body.classList.remove("offline-active");
  manuallyDismissed = false;
}

offlineBannerClose.addEventListener("click", () => {
  offlineBanner.classList.add("hidden");
  document.body.classList.remove("offline-active");
  manuallyDismissed = true;
});

window.addEventListener("online", () => {
  manuallyDismissed = false;
  hideOfflineBanner();
  updateSyncTime();
});
window.addEventListener("offline", () => {
  showOfflineBanner();
});

if (!navigator.onLine) showOfflineBanner();

// ══════════════════════════════════════════════════════════════
//  DATA LAST SYNCED TIMESTAMP
// ══════════════════════════════════════════════════════════════
const syncTimeText = document.getElementById("sync-time-text");

function updateSyncTime() {
  if (!syncTimeText) return;
  const now = new Date();
  syncTimeText.textContent = `Synced ${now.toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

// ══════════════════════════════════════════════════════════════
//  HANDLE PASSWORD RESET LINK
// ══════════════════════════════════════════════════════════════
function handleEmailAction() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const oobCode = params.get("oobCode");
  if (mode === "resetPassword" && oobCode) {
    showPasswordResetForm(oobCode);
  }
}

function showPasswordResetForm(oobCode) {
  const loginScreen = document.getElementById("login-screen");
  loginScreen.style.display = "none";

  const resetScreen = document.createElement("div");
  resetScreen.id = "reset-screen";
  resetScreen.style.cssText = `
    min-height:100vh;width:100vw;display:flex;align-items:center;justify-content:center;
    padding:20px;position:fixed;top:0;left:0;z-index:99999;overflow:hidden;
    background:linear-gradient(135deg,#0f2147 0%,#1a3368 50%,#0a1a3a 100%);
  `;

  resetScreen.innerHTML = `
    <div style="position:absolute;inset:0;z-index:0;pointer-events:none;">
      <div style="position:absolute;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,#2d52b8,transparent);top:-150px;right:-100px;filter:blur(80px);opacity:0.3;"></div>
      <div style="position:absolute;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,#b5820a,transparent);bottom:-100px;left:-80px;filter:blur(80px);opacity:0.3;"></div>
    </div>
    <div class="login-card" style="position:relative;z-index:1;">
      <div class="login-brand">
        <div class="login-brand-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <div>
          <h1 class="login-title">RCCG Immanuel</h1>
          <p class="login-subtitle">Mega Parish — Youth Province 13</p>
        </div>
      </div>
      <div class="login-divider"></div>
      <p class="login-label">Set New Password</p>
      <div class="login-field">
        <label class="field-label" for="new-password">New Password</label>
        <div class="input-wrap">
          <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input type="password" id="new-password" placeholder="Enter new password" />
        </div>
      </div>
      <div class="login-field">
        <label class="field-label" for="confirm-password">Confirm Password</label>
        <div class="input-wrap">
          <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input type="password" id="confirm-password" placeholder="Confirm new password" />
        </div>
      </div>
      <p id="reset-form-error" class="login-error" role="alert"></p>
      <button id="reset-confirm-btn" class="login-btn">
        <span id="reset-confirm-text">Set New Password</span>
        <span id="reset-confirm-spinner" class="btn-spinner" style="display:none"></span>
      </button>
      <p class="login-secure-note">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
        Secure access — authorized personnel only
      </p>
    </div>
  `;
  document.body.appendChild(resetScreen);
  window.history.replaceState({}, document.title, window.location.pathname);

  verifyPasswordResetCode(auth, oobCode).catch(() => {
    const errEl = document.getElementById("reset-form-error");
    const btn = document.getElementById("reset-confirm-btn");
    if (errEl)
      errEl.textContent =
        "This reset link has expired or already been used. Please request a new one.";
    if (btn) btn.disabled = true;
  });

  document
    .getElementById("reset-confirm-btn")
    .addEventListener("click", async () => {
      const newPassword = document.getElementById("new-password").value;
      const confirmPassword = document.getElementById("confirm-password").value;
      const errorEl = document.getElementById("reset-form-error");
      const spinner = document.getElementById("reset-confirm-spinner");
      const btnText = document.getElementById("reset-confirm-text");
      const btn = document.getElementById("reset-confirm-btn");

      errorEl.textContent = "";
      if (!newPassword || newPassword.length < 6) {
        errorEl.textContent = "Password must be at least 6 characters.";
        return;
      }
      if (newPassword !== confirmPassword) {
        errorEl.textContent = "Passwords do not match.";
        return;
      }

      btn.disabled = true;
      spinner.style.display = "inline-block";
      btnText.textContent = "Saving…";

      try {
        await confirmPasswordReset(auth, oobCode, newPassword);
        resetScreen.remove();
        loginScreen.style.display = "flex";
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        showToast(
          "success",
          "Password updated",
          "You can now sign in with your new password."
        );
      } catch (err) {
        if (err.code === "auth/expired-action-code") {
          errorEl.textContent =
            "This link has expired. Please request a new reset email.";
        } else if (err.code === "auth/weak-password") {
          errorEl.textContent =
            "Password is too weak. Use at least 6 characters.";
        } else {
          errorEl.textContent = "Something went wrong. Please try again.";
        }
        btn.disabled = false;
        spinner.style.display = "none";
        btnText.textContent = "Set New Password";
      }
    });

  ["new-password", "confirm-password"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        document.getElementById("reset-confirm-btn").click();
    });
  });
}

handleEmailAction();

// ══════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════
const pages = document.querySelectorAll(".page");
const navItems = document.querySelectorAll(".nav-item");
const mobileTitleEl = document.getElementById("mobile-page-title");

const pageTitles = {
  dashboard: "Dashboard",
  members: "Members",
  register: "Register Member",
  birthdays: "Birthdays",
  attendance: "Attendance",
  export: "Export Data",
};

function navigateTo(pageId) {
  if (pageId !== "register" && formIsDirty() && auth.currentUser) {
    const confirmed = confirm(
      "You have unsaved changes in the registration form. Leave anyway?"
    );
    if (!confirmed) return;
  }
  pages.forEach((p) => p.classList.remove("active"));
  navItems.forEach((n) => {
    n.classList.remove("active");
    n.removeAttribute("aria-current");
  });

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add("active");

  const targetNav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (targetNav) {
    targetNav.classList.add("active");
    targetNav.setAttribute("aria-current", "page");
  }

  if (mobileTitleEl) mobileTitleEl.textContent = pageTitles[pageId] || "";
  if (pageId !== "register") resetForm();
  closeMobileSidebar();

  if (pageId === "dashboard") requestAnimationFrame(() => renderDashboard());
  if (pageId === "members") applyFilters();
  if (pageId === "birthdays") renderBirthdaysPage();
  if (pageId === "attendance") renderAttendancePage();
  if (pageId === "export") initExportPage();
}

document.querySelectorAll("[data-page]").forEach((btn) => {
  btn.addEventListener("click", () => navigateTo(btn.dataset.page));
});

// ══════════════════════════════════════════════════════════════
//  MOBILE SIDEBAR
// ══════════════════════════════════════════════════════════════
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const mobileMenuBtn = document.getElementById("mobile-menu-btn");

function closeMobileSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("open");
}

mobileMenuBtn.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  sidebarOverlay.classList.toggle("open");
});

sidebarOverlay.addEventListener("click", closeMobileSidebar);

// ══════════════════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════════════════
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");

loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const spinner = document.getElementById("login-spinner");
  const btnText = document.getElementById("login-btn-text");

  if (!email || !password) {
    loginError.textContent = "Please enter your email and password.";
    return;
  }

  spinner.style.display = "inline-block";
  btnText.textContent = "Signing in…";
  loginBtn.disabled = true;
  loginError.textContent = "";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = "Incorrect email or password. Please try again.";
    spinner.style.display = "none";
    btnText.textContent = "Sign In";
    loginBtn.disabled = false;
  }
});

["login-email", "login-password"].forEach((id) => {
  document.getElementById(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });
});

// ══════════════════════════════════════════════════════════════
//  FORGOT PASSWORD MODAL
// ══════════════════════════════════════════════════════════════
const forgotModal = document.getElementById("forgot-modal");
const forgotPasswordLink = document.getElementById("forgot-password-link");
const forgotCancelBtn = document.getElementById("forgot-cancel-btn");
const forgotSendBtn = document.getElementById("forgot-send-btn");
const forgotSendText = document.getElementById("forgot-send-text");
const forgotSendSpinner = document.getElementById("forgot-send-spinner");
const resetEmailInput = document.getElementById("reset-email-input");
const resetEmailError = document.getElementById("reset-email-error");

function openForgotModal() {
  resetEmailInput.value = "";
  resetEmailError.textContent = "";
  forgotModal.style.display = "flex";
  document.body.style.overflow = "hidden";
  setTimeout(() => resetEmailInput.focus(), 100);
}

function closeForgotModal() {
  forgotModal.style.display = "none";
  document.body.style.overflow = "";
}

forgotPasswordLink.addEventListener("click", openForgotModal);
forgotCancelBtn.addEventListener("click", closeForgotModal);
forgotModal.addEventListener("click", (e) => {
  if (e.target === forgotModal) closeForgotModal();
});

forgotSendBtn.addEventListener("click", async () => {
  const email = resetEmailInput.value.trim();
  resetEmailError.textContent = "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    resetEmailError.textContent = "Please enter a valid email address.";
    resetEmailInput.focus();
    return;
  }

  forgotSendBtn.disabled = true;
  forgotSendText.textContent = "Sending…";
  forgotSendSpinner.style.display = "inline-block";

  try {
    await sendPasswordResetEmail(auth, email);
    closeForgotModal();
    showToast(
      "success",
      "Reset link sent",
      `Check ${email} for your password reset link.`
    );
  } catch (err) {
    resetEmailError.textContent =
      "Could not send reset link. Check the address and try again.";
  } finally {
    forgotSendBtn.disabled = false;
    forgotSendText.textContent = "Send reset link";
    forgotSendSpinner.style.display = "none";
  }
});

resetEmailInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") forgotSendBtn.click();
});

// ══════════════════════════════════════════════════════════════
//  SESSION TIMEOUT  (BUG FIX med#7: mousemove throttled to 30s)
// ══════════════════════════════════════════════════════════════
const SESSION_IDLE_MS = 25 * 60 * 1000;
const SESSION_GRACE_MS = 5 * 60 * 1000;
const sessionWarningModal = document.getElementById("session-warning-modal");
const sessionCountdownEl = document.getElementById("session-countdown");
const sessionStayBtn = document.getElementById("session-stay-btn");
const sessionLogoutBtn = document.getElementById("session-logout-btn");

let idleTimer = null;
let countdownInterval = null;
let graceSecondsLeft = 0;

let _lastMouseMoveReset = 0;
function throttledMouseMoveReset() {
  const now = Date.now();
  if (now - _lastMouseMoveReset < 30_000) return;
  _lastMouseMoveReset = now;
  resetIdleTimer();
}

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(showSessionWarning, SESSION_IDLE_MS);
}

function showSessionWarning() {
  graceSecondsLeft = Math.floor(SESSION_GRACE_MS / 1000);
  sessionCountdownEl.textContent = graceSecondsLeft;
  sessionWarningModal.style.display = "flex";
  document.body.style.overflow = "hidden";

  countdownInterval = setInterval(() => {
    graceSecondsLeft -= 1;
    sessionCountdownEl.textContent = graceSecondsLeft;
    if (graceSecondsLeft <= 0) {
      clearInterval(countdownInterval);
      dismissSessionWarning();
      signOut(auth);
    }
  }, 1000);
}

function dismissSessionWarning() {
  clearInterval(countdownInterval);
  countdownInterval = null;
  sessionWarningModal.style.display = "none";
  document.body.style.overflow = "";
  document.body.classList.remove("offline-active");
}

sessionStayBtn.addEventListener("click", () => {
  dismissSessionWarning();
  resetIdleTimer();
});
sessionLogoutBtn.addEventListener("click", () => {
  dismissSessionWarning();
  signOut(auth);
});

const IDLE_EVENTS_DIRECT = ["keydown", "mousedown", "touchstart", "scroll"];

function startIdleTracking() {
  document.addEventListener("mousemove", throttledMouseMoveReset, {
    passive: true,
  });
  IDLE_EVENTS_DIRECT.forEach((evt) =>
    document.addEventListener(evt, resetIdleTimer, { passive: true })
  );
  resetIdleTimer();
}

function stopIdleTracking() {
  clearTimeout(idleTimer);
  clearInterval(countdownInterval);
  document.removeEventListener("mousemove", throttledMouseMoveReset);
  IDLE_EVENTS_DIRECT.forEach((evt) =>
    document.removeEventListener(evt, resetIdleTimer)
  );
  dismissSessionWarning();
}

// ══════════════════════════════════════════════════════════════
//  LOGOUT
// ══════════════════════════════════════════════════════════════
document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    const spinner = document.getElementById("login-spinner");
    const btnText = document.getElementById("login-btn-text");
    const lb = document.getElementById("login-btn");
    if (spinner) spinner.style.display = "none";
    if (btnText) btnText.textContent = "Sign In";
    if (lb) lb.disabled = false;
    document.getElementById("login-email").value = "";
    document.getElementById("login-password").value = "";
    document.getElementById("login-error").textContent = "";
  } catch (err) {
    showToast("error", "Sign out failed", "Please try again.");
  }
});

// ══════════════════════════════════════════════════════════════
//  AUTH STATE
// ══════════════════════════════════════════════════════════════
let unsubscribeMembers = null;
let unsubscribeAttendance = null;

onAuthStateChanged(auth, (user) => {
  if (document.getElementById("reset-screen")) return;

  if (user) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-app").style.display = "block";

    const displayName = user.displayName || user.email || "Admin";
    const initial = displayName.charAt(0).toUpperCase();
    document.getElementById("sidebar-user-avatar").textContent = initial;

    setGreeting();
    startRealtimeListener();
    startAttendanceListener();
    startIdleTracking();
    navigateTo("dashboard");
  } else {
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("main-app").style.display = "none";

    stopIdleTracking();

    if (unsubscribeMembers) {
      unsubscribeMembers();
      unsubscribeMembers = null;
    }
    if (unsubscribeAttendance) {
      unsubscribeAttendance();
      unsubscribeAttendance = null;
    }
    allMembers = [];
    attendanceData = [];
  }
});

// ══════════════════════════════════════════════════════════════
//  GREETING
// ══════════════════════════════════════════════════════════════
function setGreeting() {
  const hour = new Date().getHours();
  const greetingEl = document.getElementById("dashboard-greeting");
  if (!greetingEl) return;
  if (hour < 12)
    greetingEl.textContent = "Good morning — here's your parish overview";
  else if (hour < 17)
    greetingEl.textContent = "Good afternoon — here's your parish overview";
  else greetingEl.textContent = "Good evening — here's your parish overview";
}

// ══════════════════════════════════════════════════════════════
//  REAL-TIME LISTENER — MEMBERS
// ══════════════════════════════════════════════════════════════
let allMembers = [];

function startRealtimeListener() {
  unsubscribeMembers = onSnapshot(
    collection(db, "members"),
    (snapshot) => {
      allMembers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      document.getElementById("nav-member-count").textContent =
        allMembers.length;
      updateSyncTime();

      const activePage = document.querySelector(".page.active");
      if (activePage) {
        const pageId = activePage.id.replace("page-", "");
        if (pageId === "dashboard")
          requestAnimationFrame(() => renderDashboard());
        if (pageId === "members") applyFilters();
        if (pageId === "birthdays") renderBirthdaysPage();
        if (pageId === "export") updateExportLiveCount();
      }
    },
    (err) => {
      console.error("Firestore listener error:", err);
      showToast(
        "error",
        "Connection error",
        "Failed to load members. Please refresh."
      );
    }
  );
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// BUG FIX med#12: guard against malformed date strings
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const parts = dateStr.split("-");
  if (parts.length < 3) return "—";
  const [y, m, d] = parts;
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  if (isNaN(month) || isNaN(day) || month < 1 || month > 12) return "—";
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${day} ${months[month - 1]} ${y}`;
}

function formatDayMonth(dateStr) {
  if (!dateStr) return "—";
  const parts = dateStr.split("-");
  if (parts.length < 3) return "—";
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(day)) return "—";
  return `${day} ${months[month - 1]}`;
}

function formatShortDate(dateStr) {
  if (!dateStr) return "";
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const parts = dateStr.split("-");
  if (parts.length < 3) return "";
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(m) || isNaN(d)) return "";
  return `${d} ${months[m - 1]}`;
}

function getDaysUntilBirthday(dobStr) {
  if (!dobStr) return null;
  const parts = dobStr.split("-");
  if (parts.length < 3) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bm = parseInt(parts[1], 10);
  const bd = parseInt(parts[2], 10);
  if (isNaN(bm) || isNaN(bd)) return null;
  let bday = new Date(today.getFullYear(), bm - 1, bd);
  if (bday < today) bday.setFullYear(today.getFullYear() + 1);
  return Math.round((bday - today) / 86400000);
}

function isBirthdayToday(dobStr) {
  if (!dobStr) return false;
  const parts = dobStr.split("-");
  if (parts.length < 3) return false;
  const bm = parseInt(parts[1], 10);
  const bd = parseInt(parts[2], 10);
  const today = new Date();
  return bm === today.getMonth() + 1 && bd === today.getDate();
}

// ══════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════
function renderDashboard() {
  const totalMembers = allMembers.filter((p) => p.role === "Member").length;
  const totalWorkers = allMembers.filter((p) => p.role === "Worker").length;
  const birthdaysToday = allMembers.filter((p) =>
    isBirthdayToday(p.dob)
  ).length;
  const total = allMembers.length;
  const totalMales = allMembers.filter((p) => p.gender === "Male").length;
  const totalFemales = allMembers.filter((p) => p.gender === "Female").length;

  animateCounter("stat-members", totalMembers);
  animateCounter("stat-workers", totalWorkers);
  animateCounter("stat-birthdays-today", birthdaysToday);
  animateCounter("stat-total", total);
  animateCounter("stat-males", totalMales);
  animateCounter("stat-females", totalFemales);

  // Birthday banner
  const bannerEl = document.getElementById("birthday-banner");
  const todayBirthdays = allMembers.filter((p) => isBirthdayToday(p.dob));
  if (todayBirthdays.length > 0) {
    const names = todayBirthdays.map((p) => escapeHtml(p.fullName)).join(", ");
    bannerEl.innerHTML = `🎂 <span>Birthday today: <strong>${names}</strong> — don't forget to celebrate!</span>`;
    bannerEl.style.display = "flex";
  } else {
    bannerEl.style.display = "none";
  }

  // Upcoming birthdays (next 7 days)
  const upcomingEl = document.getElementById("upcoming-birthdays-list");
  const upcoming = allMembers
    .map((p) => ({ ...p, daysLeft: getDaysUntilBirthday(p.dob) }))
    .filter((p) => p.daysLeft !== null && p.daysLeft >= 1 && p.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (upcoming.length === 0) {
    upcomingEl.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:12px 0;">No upcoming birthdays in the next 7 days.</p>`;
  } else {
    upcomingEl.innerHTML = upcoming
      .map(
        (p) => `
      <div class="birthday-row">
        <div class="birthday-avatar">${getInitials(p.fullName)}</div>
        <div class="birthday-info">
          <div class="birthday-name">${escapeHtml(p.fullName)}</div>
          <div class="birthday-meta">${escapeHtml(p.role)}${
          p.department ? ` · ${escapeHtml(p.department)}` : ""
        }</div>
        </div>
        <span class="birthday-days">${
          p.daysLeft === 1 ? "Tomorrow" : `In ${p.daysLeft} days`
        }</span>
      </div>
    `
      )
      .join("");
  }

  // Recent members
  const recentEl = document.getElementById("recent-members-list");
  const recent = [...allMembers]
    .filter((p) => p.createdAt)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
    .slice(0, 5);

  if (recent.length === 0) {
    recentEl.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:12px 0;">No members registered yet.</p>`;
  } else {
    recentEl.innerHTML = recent
      .map(
        (p) => `
      <div class="member-row">
        <div class="member-avatar-sm ${
          p.role === "Worker" ? "worker" : ""
        }">${getInitials(p.fullName)}</div>
        <div class="member-row-info">
          <div class="member-row-name">${escapeHtml(p.fullName)}</div>
          <div class="member-row-meta">${escapeHtml(p.role)}${
          p.department ? ` · ${escapeHtml(p.department)}` : ""
        }</div>
        </div>
      </div>
    `
      )
      .join("");
  }

  requestAnimationFrame(() => renderGenderQuarterlyChart());
}

function animateCounter(elId, target) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (el._countTimer) {
    clearInterval(el._countTimer);
    el._countTimer = null;
  }
  if (el.querySelector && el.querySelector(".skeleton")) el.innerHTML = "0";
  const current = parseInt(el.textContent) || 0;
  if (current === target) {
    el.textContent = target;
    return;
  }
  const step = Math.ceil(Math.abs(target - current) / 20);
  let val = current;
  el._countTimer = setInterval(() => {
    val =
      val < target
        ? Math.min(val + step, target)
        : Math.max(val - step, target);
    el.textContent = val;
    if (val === target) {
      clearInterval(el._countTimer);
      el._countTimer = null;
    }
  }, 30);
}

// ══════════════════════════════════════════════════════════════
//  QUARTERLY GENDER CHART (Dashboard)
//  BUG FIX med#8: resize debounced at 150ms
// ══════════════════════════════════════════════════════════════
let _genderChartResizeTimer = null;

function renderGenderQuarterlyChart() {
  const canvas = document.getElementById("gender-quarterly-chart");
  const emptyEl = document.getElementById("gender-quarterly-empty");
  if (!canvas) return;

  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const currentYear = now.getFullYear();

  const quarters = [];
  for (let q = 1; q <= currentQuarter; q++) {
    quarters.push({ label: `Q${q}`, male: 0, female: 0 });
  }

  allMembers.forEach((m) => {
    if (!m.createdAt) return;
    const created = m.createdAt.toDate
      ? m.createdAt.toDate()
      : new Date(m.createdAt.seconds * 1000);
    if (created.getFullYear() !== currentYear) return;
    const q = Math.floor(created.getMonth() / 3);
    if (q >= quarters.length) return;
    if (m.gender === "Male") quarters[q].male += 1;
    else if (m.gender === "Female") quarters[q].female += 1;
  });

  const hasData = quarters.some((q) => q.male > 0 || q.female > 0);
  if (!hasData) {
    canvas.style.display = "none";
    if (emptyEl) emptyEl.style.display = "flex";
    return;
  }
  canvas.style.display = "block";
  if (emptyEl) emptyEl.style.display = "none";

  _drawGenderChart(canvas, quarters);

  if (!canvas._resizeHandler) {
    canvas._resizeHandler = () => {
      clearTimeout(_genderChartResizeTimer);
      _genderChartResizeTimer = setTimeout(() => {
        _drawGenderChart(canvas, quarters);
      }, 150);
    };
    window.addEventListener("resize", canvas._resizeHandler);
  }
}

function _drawGenderChart(canvas, quarters) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth || 560;
  const H = 200;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const NAVY = "#0f2147";
  const GOLD = "#d4a017";
  const BORDER = "#e2e8f5";
  const MUTED = "#8a94a8";
  const PAD_L = 38,
    PAD_R = 12,
    PAD_T = 28,
    PAD_B = 36;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const maxVal = Math.max(...quarters.map((q) => q.male + q.female), 1);
  const yMax = Math.ceil(maxVal / 5) * 5 || 5;

  for (let i = 0; i <= 4; i++) {
    const y = PAD_T + chartH - (i / 4) * chartH;
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(PAD_L + chartW, y);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.font = "10px Sora, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(Math.round((i / 4) * yMax), PAD_L - 4, y + 3);
  }

  const gap = 16;
  const barW = Math.min(
    60,
    (chartW - gap * (quarters.length + 1)) / quarters.length
  );

  quarters.forEach((q, i) => {
    const x =
      PAD_L +
      gap +
      i * ((chartW - gap * (quarters.length - 1)) / quarters.length) +
      ((chartW - gap * (quarters.length - 1)) / quarters.length - barW) / 2;
    const baseY = PAD_T + chartH;
    const maleH = (q.male / yMax) * chartH;
    const femH = (q.female / yMax) * chartH;

    if (femH > 0) {
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      if (maleH === 0) {
        const r = Math.min(4, barW / 2, femH);
        ctx.moveTo(x + r, baseY - femH);
        ctx.lineTo(x + barW - r, baseY - femH);
        ctx.quadraticCurveTo(
          x + barW,
          baseY - femH,
          x + barW,
          baseY - femH + r
        );
        ctx.lineTo(x + barW, baseY);
        ctx.lineTo(x, baseY);
        ctx.lineTo(x, baseY - femH + r);
        ctx.quadraticCurveTo(x, baseY - femH, x + r, baseY - femH);
      } else {
        ctx.rect(x, baseY - maleH - femH, barW, femH);
      }
      ctx.fill();
    }
    if (maleH > 0) {
      ctx.fillStyle = NAVY;
      ctx.beginPath();
      const r = Math.min(4, barW / 2, maleH);
      if (femH === 0) {
        ctx.moveTo(x + r, baseY - maleH);
        ctx.lineTo(x + barW - r, baseY - maleH);
        ctx.quadraticCurveTo(
          x + barW,
          baseY - maleH,
          x + barW,
          baseY - maleH + r
        );
        ctx.lineTo(x + barW, baseY);
        ctx.lineTo(x, baseY);
        ctx.lineTo(x, baseY - maleH + r);
        ctx.quadraticCurveTo(x, baseY - maleH, x + r, baseY - maleH);
      } else {
        ctx.rect(x, baseY - maleH, barW, maleH);
      }
      ctx.fill();
    }

    ctx.fillStyle = MUTED;
    ctx.font = "10px Sora, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(q.label, x + barW / 2, H - PAD_B + 14);

    const stackH = maleH + femH;
    if (stackH > 14) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px Sora, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(q.male + q.female, x + barW / 2, baseY - stackH / 2 + 3);
    }
  });

  const legY = PAD_T - 14;
  ctx.fillStyle = NAVY;
  ctx.fillRect(PAD_L + 2, legY, 10, 8);
  ctx.fillStyle = MUTED;
  ctx.font = "9px Sora, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Male", PAD_L + 15, legY + 7);
  ctx.fillStyle = GOLD;
  ctx.fillRect(PAD_L + 55, legY, 10, 8);
  ctx.fillStyle = MUTED;
  ctx.fillText("Female", PAD_L + 68, legY + 7);
}

// ══════════════════════════════════════════════════════════════
//  MEMBERS PAGE — SEARCH & FILTER
// ══════════════════════════════════════════════════════════════
const searchInput = document.getElementById("search-input");
const filterChips = document.querySelectorAll(".chip[data-filter]");

searchInput.addEventListener("input", applyFilters);

filterChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    filterChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    applyFilters();
  });
});

function applyFilters() {
  const q = searchInput.value.toLowerCase();
  const activeChip = document.querySelector(".chip.active");
  const roleFilter = activeChip ? activeChip.dataset.filter : "all";

  const filtered = allMembers.filter((p) => {
    const matchSearch =
      p.fullName?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.department?.toLowerCase().includes(q);
    const matchRole = roleFilter === "all" || p.role === roleFilter;
    return matchSearch && matchRole;
  });

  renderMembersGrid(filtered);

  const countText = document.getElementById("members-count-text");
  if (countText) {
    countText.textContent = `${filtered.length} of ${allMembers.length} ${
      allMembers.length === 1 ? "member" : "members"
    }`;
  }
}

// ══════════════════════════════════════════════════════════════
//  MEMBERS GRID  (BUG FIX med#13: escapeHtml on all user data)
// ══════════════════════════════════════════════════════════════
function renderMembersGrid(list) {
  const grid = document.getElementById("members-grid");
  if (!grid) return;

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>No members found</p>
        <span class="empty-state-sub">Try adjusting your search or filter</span>
      </div>
    `;
    return;
  }

  grid.innerHTML = list
    .map(
      (person) => `
    <div class="member-card" data-id="${escapeHtml(person.id)}">
      <div class="member-card-head">
        <div class="member-avatar ${
          person.role === "Worker" ? "worker" : ""
        }">${getInitials(person.fullName)}</div>
        <div>
          <div class="member-card-name">${escapeHtml(person.fullName)}</div>
          <span class="role-pill ${
            person.role === "Worker" ? "worker" : "member"
          }">${escapeHtml(person.role)}</span>
        </div>
      </div>
      <div class="member-card-detail">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>
        ${escapeHtml(person.email)}
      </div>
      ${
        person.phone
          ? `
      <div class="member-card-detail">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.21 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        ${escapeHtml(person.phone)}
      </div>`
          : ""
      }
      <div class="member-card-detail">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        DOB: ${formatDate(person.dob)}
      </div>
      ${
        person.gender
          ? `
      <div class="member-card-detail">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M12 14c-5 0-8 2.5-8 4v1h16v-1c0-1.5-3-4-8-4z"/></svg>
        ${escapeHtml(person.gender)}
      </div>`
          : ""
      }
      ${
        person.department
          ? `
      <div class="member-card-detail">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        ${escapeHtml(person.department)}
      </div>`
          : ""
      }
      <div class="member-card-footer">
        <button class="btn-edit" data-id="${escapeHtml(person.id)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        <button class="btn-delete" data-id="${escapeHtml(person.id)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          Delete
        </button>
      </div>
    </div>
  `
    )
    .join("");

  grid.querySelectorAll(".member-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".btn-edit") || e.target.closest(".btn-delete"))
        return;
      const person = allMembers.find((p) => p.id === card.dataset.id);
      if (person) openProfileDrawer(person);
    });
  });

  grid.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const person = allMembers.find((p) => p.id === btn.dataset.id);
      if (person) loadPersonIntoForm(person);
    });
  });

  grid.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const person = allMembers.find((p) => p.id === btn.dataset.id);
      if (person) confirmDelete(person);
    });
  });
}

// ══════════════════════════════════════════════════════════════
//  PROFILE DRAWER  (BUG FIX med#13: escapeHtml; Date Joined removed; Gender added)
// ══════════════════════════════════════════════════════════════
const profileOverlay = document.getElementById("profile-overlay");
const profileContent = document.getElementById("profile-content");
const profileClose = document.getElementById("profile-close");

function openProfileDrawer(person) {
  const roleClass = person.role === "Worker" ? "worker" : "";
  profileContent.innerHTML = `
    <div class="profile-avatar-lg">${getInitials(person.fullName)}</div>
    <div class="profile-name">${escapeHtml(person.fullName)}</div>
    <span class="profile-role-tag ${roleClass}">${escapeHtml(
    person.role
  )}</span>
    <div class="profile-details">
      <div class="profile-detail-row">
        <div class="profile-detail-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg></div>
        <div class="profile-detail-content">
          <div class="profile-detail-label">Email</div>
          <div class="profile-detail-value">${escapeHtml(person.email)}</div>
        </div>
      </div>
      <div class="profile-detail-row">
        <div class="profile-detail-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.21 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>
        <div class="profile-detail-content">
          <div class="profile-detail-label">Phone</div>
          <div class="profile-detail-value">${escapeHtml(
            person.phone || "Not provided"
          )}</div>
        </div>
      </div>
      <div class="profile-detail-row">
        <div class="profile-detail-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div class="profile-detail-content">
          <div class="profile-detail-label">Date of Birth</div>
          <div class="profile-detail-value">${formatDate(person.dob)}</div>
        </div>
      </div>
      ${
        person.gender
          ? `
      <div class="profile-detail-row">
        <div class="profile-detail-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M12 14c-5 0-8 2.5-8 4v1h16v-1c0-1.5-3-4-8-4z"/></svg></div>
        <div class="profile-detail-content">
          <div class="profile-detail-label">Gender</div>
          <div class="profile-detail-value">${escapeHtml(person.gender)}</div>
        </div>
      </div>`
          : ""
      }
      ${
        person.department
          ? `
      <div class="profile-detail-row">
        <div class="profile-detail-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
        <div class="profile-detail-content">
          <div class="profile-detail-label">Department</div>
          <div class="profile-detail-value">${escapeHtml(
            person.department
          )}</div>
        </div>
      </div>`
          : ""
      }
      ${
        person.notes
          ? `
      <div class="profile-detail-row">
        <div class="profile-detail-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
        <div class="profile-detail-content">
          <div class="profile-detail-label">Notes</div>
          <div class="profile-detail-value">${escapeHtml(person.notes)}</div>
        </div>
      </div>`
          : ""
      }
    </div>
    <div class="profile-actions">
      <button class="btn-edit" style="flex:1;min-height:38px;" data-id="${escapeHtml(
        person.id
      )}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
      </button>
      <button class="btn-delete" style="flex:1;min-height:38px;" data-id="${escapeHtml(
        person.id
      )}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        Delete
      </button>
    </div>
  `;

  profileContent.querySelector(".btn-edit")?.addEventListener("click", () => {
    closeProfileDrawer();
    loadPersonIntoForm(person);
  });
  profileContent.querySelector(".btn-delete")?.addEventListener("click", () => {
    closeProfileDrawer();
    confirmDelete(person);
  });

  profileOverlay.style.display = "block";
  document.body.style.overflow = "hidden";
}

function closeProfileDrawer() {
  profileOverlay.style.display = "none";
  document.body.style.overflow = "";
}

profileClose.addEventListener("click", closeProfileDrawer);

let _drawerPointerDownX = 0;
let _drawerPointerDownY = 0;

profileOverlay.addEventListener("pointerdown", (e) => {
  _drawerPointerDownX = e.clientX;
  _drawerPointerDownY = e.clientY;
});

profileOverlay.addEventListener("click", (e) => {
  if (e.target !== profileOverlay) return;
  const dx = Math.abs(e.clientX - _drawerPointerDownX);
  const dy = Math.abs(e.clientY - _drawerPointerDownY);
  if (dx > 8 || dy > 8) return;
  closeProfileDrawer();
});

// ══════════════════════════════════════════════════════════════
//  REGISTRATION & EDIT FORM
//  (Date Joined removed; Gender added; BUG FIX med#14: dirty-form)
// ══════════════════════════════════════════════════════════════
const form = document.getElementById("reg-form");
const submitBtn = document.getElementById("form-submit-btn");
const cancelBtn = document.getElementById("form-cancel-btn");
const formPageTitle = document.getElementById("form-page-title");

const fields = {
  fullName: () => document.getElementById("f-fullName"),
  dob: () => document.getElementById("f-dob"),
  gender: () => document.getElementById("f-gender"),
  role: () => document.getElementById("f-role"),
  email: () => document.getElementById("f-email"),
  phone: () => document.getElementById("f-phone"),
  department: () => document.getElementById("f-department"),
  notes: () => document.getElementById("f-notes"),
};

function formIsDirty() {
  if (!form) return false;
  if (form.dataset.editId) return true;
  const textFields = ["fullName", "dob", "email", "phone", "notes"];
  return textFields.some((key) => {
    const el = fields[key]();
    return el && el.value.trim() !== "";
  });
}

function validateForm() {
  let valid = true;
  const rules = [
    { field: "fullName", errId: "err-fullName", msg: "Full name is required." },
    { field: "dob", errId: "err-dob", msg: "Date of birth is required." },
    { field: "gender", errId: "err-gender", msg: "Please select a gender." },
    {
      field: "email",
      errId: "err-email",
      msg: "A valid email address is required.",
      extra: (v) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Enter a valid email address.",
    },
  ];

  rules.forEach(({ field, errId, msg, extra }) => {
    const el = fields[field]();
    if (!el) return;
    const errEl = document.getElementById(errId);
    const value = el.value.trim();
    el.classList.remove("invalid");
    if (errEl) errEl.textContent = "";
    if (!value) {
      el.classList.add("invalid");
      if (errEl) errEl.textContent = msg;
      valid = false;
    } else if (extra) {
      const extraResult = extra(value);
      if (typeof extraResult === "string") {
        el.classList.add("invalid");
        if (errEl) errEl.textContent = extraResult;
        valid = false;
      }
    }
  });
  return valid;
}

function resetForm() {
  form.reset();
  delete form.dataset.editId;
  Object.values(fields).forEach((fn) => {
    const el = fn();
    if (el) el.classList.remove("invalid");
  });
  ["err-fullName", "err-dob", "err-gender", "err-email"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
  if (submitBtn) {
    submitBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Register Member
    `;
  }
  if (formPageTitle) formPageTitle.textContent = "Register Member";
  if (cancelBtn) cancelBtn.style.display = "none";
}

function loadPersonIntoForm(person) {
  fields.fullName().value = person.fullName || "";
  fields.dob().value = person.dob || "";
  fields.gender().value = person.gender || "";
  fields.role().value = person.role || "Member";
  fields.email().value = person.email || "";
  fields.phone().value = person.phone || "";
  fields.department().value = person.department || "";
  fields.notes().value = person.notes || "";
  form.dataset.editId = person.id;
  if (submitBtn) {
    submitBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Update Member
    `;
  }
  if (formPageTitle) formPageTitle.textContent = "Edit Member";
  if (cancelBtn) cancelBtn.style.display = "inline-flex";
  navigateTo("register");
  document
    .getElementById("page-register")
    ?.scrollIntoView({ behavior: "smooth" });
}

cancelBtn.addEventListener("click", () => {
  resetForm();
  if (auth.currentUser) navigateTo("members");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const fullName = fields.fullName().value.trim();
  const dob = fields.dob().value;
  const gender = fields.gender().value;
  const role = fields.role().value;
  const email = fields.email().value.trim();
  const phone = fields.phone().value.trim();
  const department = fields.department().value;
  const notes = fields.notes().value.trim();
  const editId = form.dataset.editId;

  const duplicate = allMembers.some(
    (m) => m.email.toLowerCase() === email.toLowerCase() && m.id !== editId
  );
  if (duplicate) {
    const emailEl = fields.email();
    const errEl = document.getElementById("err-email");
    emailEl.classList.add("invalid");
    if (errEl)
      errEl.textContent = "This email is already registered to another member.";
    emailEl.focus();
    return;
  }

  submitBtn.disabled = true;
  const originalHTML = submitBtn.innerHTML;
  submitBtn.innerHTML = `<span class="btn-spinner"></span> Saving…`;

  try {
    if (editId) {
      await updateDoc(doc(db, "members", editId), {
        fullName,
        dob,
        gender: gender || null,
        role,
        email,
        phone: phone || null,
        department: department || null,
        notes: notes || null,
      });
      showToast(
        "success",
        "Member updated",
        `${escapeHtml(fullName)}'s record has been updated.`
      );
      resetForm();
      navigateTo("members");
    } else {
      await addDoc(collection(db, "members"), {
        fullName,
        dob,
        gender: gender || null,
        role,
        email,
        phone: phone || null,
        department: department || null,
        notes: notes || null,
        createdAt: Timestamp.now(),
      });
      showToast(
        "success",
        "Member registered",
        `${escapeHtml(fullName)} has been added to the system.`
      );
      resetForm();
    }
  } catch (err) {
    console.error("Save error:", err);
    showToast(
      "error",
      "Save failed",
      "Could not save the record. Please try again."
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHTML;
  }
});

// ══════════════════════════════════════════════════════════════
//  DELETE — CONFIRMATION MODAL
// ══════════════════════════════════════════════════════════════
const modalOverlay = document.getElementById("modal-overlay");
const modalCancel = document.getElementById("modal-cancel");
const modalConfirm = document.getElementById("modal-confirm");
const modalMessage = document.getElementById("modal-message");

let pendingDeleteId = null;
let pendingDeleteName = "";

function confirmDelete(person) {
  pendingDeleteId = person.id;
  pendingDeleteName = person.fullName;
  modalMessage.textContent = `This will permanently remove ${person.fullName} from the system. This action cannot be undone.`;
  modalOverlay.style.display = "flex";
  document.body.style.overflow = "hidden";
}

modalCancel.addEventListener("click", () => {
  modalOverlay.style.display = "none";
  document.body.style.overflow = "";
  pendingDeleteId = null;
});

modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) modalCancel.click();
});

modalConfirm.addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  modalConfirm.disabled = true;
  modalConfirm.textContent = "Deleting…";
  try {
    await deleteDoc(doc(db, "members", pendingDeleteId));
    showToast(
      "success",
      "Member deleted",
      `${escapeHtml(pendingDeleteName)} has been removed.`
    );
  } catch (err) {
    showToast(
      "error",
      "Delete failed",
      "Could not delete the record. Please try again."
    );
  } finally {
    modalOverlay.style.display = "none";
    document.body.style.overflow = "";
    modalConfirm.disabled = false;
    modalConfirm.textContent = "Delete";
    pendingDeleteId = null;
  }
});

// ══════════════════════════════════════════════════════════════
//  BIRTHDAYS PAGE
// ══════════════════════════════════════════════════════════════
function renderBirthdaysPage() {
  const container = document.getElementById("birthdays-content");
  if (!container) return;

  const today = allMembers.filter((p) => isBirthdayToday(p.dob));
  const upcoming = allMembers
    .map((p) => ({ ...p, daysLeft: getDaysUntilBirthday(p.dob) }))
    .filter((p) => p.daysLeft !== null && p.daysLeft >= 1 && p.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const navBadge = document.getElementById("nav-birthday-count");
  if (navBadge) {
    if (today.length > 0) {
      navBadge.textContent = today.length;
      navBadge.style.display = "inline";
    } else {
      navBadge.style.display = "none";
    }
  }

  let html = `<p class="birthday-section-title">🎂 Today</p>`;
  if (today.length === 0) {
    html += `<div class="card" style="margin-bottom:18px;"><p style="font-size:13px;color:var(--text-muted);padding:8px 0;">No birthdays today.</p></div>`;
  } else {
    html += `<div class="birthday-cards-grid">`;
    today.forEach((p) => {
      html += `
        <div class="birthday-card-large today">
          <div class="birthday-avatar-lg">${getInitials(p.fullName)}</div>
          <div class="birthday-card-info">
            <div class="birthday-card-name">${escapeHtml(p.fullName)}</div>
            <div class="birthday-card-meta">${escapeHtml(p.role)}${
        p.department ? ` · ${escapeHtml(p.department)}` : ""
      } · ${escapeHtml(p.email)}</div>
          </div>
          <span class="birthday-card-tag">🎉 Today!</span>
        </div>
      `;
    });
    html += `</div>`;
  }

  html += `<p class="birthday-section-title" style="margin-top:8px;">📅 Next 30 Days</p>`;
  if (upcoming.length === 0) {
    html += `<div class="card"><p style="font-size:13px;color:var(--text-muted);padding:8px 0;">No upcoming birthdays in the next 30 days.</p></div>`;
  } else {
    html += `<div class="birthday-cards-grid">`;
    upcoming.forEach((p) => {
      html += `
        <div class="birthday-card-large">
          <div class="birthday-avatar-lg">${getInitials(p.fullName)}</div>
          <div class="birthday-card-info">
            <div class="birthday-card-name">${escapeHtml(p.fullName)}</div>
            <div class="birthday-card-meta">${escapeHtml(p.role)}${
        p.department ? ` · ${escapeHtml(p.department)}` : ""
      }</div>
          </div>
          <span class="birthday-card-tag">${
            p.daysLeft === 1 ? "Tomorrow" : `In ${p.daysLeft} days`
          }</span>
        </div>
      `;
    });
    html += `</div>`;
  }
  container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (sessionWarningModal.style.display !== "none") return;
  if (forgotModal.style.display !== "none") {
    closeForgotModal();
    return;
  }
  if (profileOverlay.style.display !== "none") {
    closeProfileDrawer();
    return;
  }
  if (modalOverlay.style.display !== "none") modalCancel.click();
});

// ══════════════════════════════════════════════════════════════
//  SCRIPTURE FOOTER
// ══════════════════════════════════════════════════════════════
const scriptureFooter = document.createElement("p");
scriptureFooter.className = "scripture-footer";
scriptureFooter.textContent =
  '"For we are labourers together with God." — 1 Corinthians 3:9';
document.getElementById("main-content")?.appendChild(scriptureFooter);

// ══════════════════════════════════════════════════════════════
//  EXPORT PAGE MODULE  (BUG FIX med#9: email delivery disabled)
// ══════════════════════════════════════════════════════════════
const exportRunBtn = document.getElementById("export-run-btn");
const exportRunText = document.getElementById("export-run-text");
const exportRunSpinner = document.getElementById("export-run-spinner");
const exportSummaryNum = document.getElementById("export-summary-num");
const exportSummaryLabel = document.getElementById("export-summary-label");
const exportSummaryMeta = document.getElementById("export-summary-meta");
const exportLiveCount = document.getElementById("export-live-count");
const exportHistoryList = document.getElementById("export-history-list");
const exportMonthFrom = document.getElementById("export-month-from");
const exportMonthTo = document.getElementById("export-month-to");
const exportDateClear = document.getElementById("export-date-clear");
const exportDateWarning = document.getElementById("export-date-warning");
const exportBlazeNotice = document.getElementById("export-blaze-notice");

const exportSessionHistory = [];
let expRole = "all";
let expFormat = "pdf";
let expDelivery = "download";

function initExportPage() {
  updateExportLiveCount();
  updateExportSummary();
  updateExportButtonLabel();
}

function updateExportLiveCount() {
  if (exportLiveCount) exportLiveCount.textContent = allMembers.length;
}

document
  .querySelectorAll("#export-role-group .export-toggle")
  .forEach((btn) => {
    btn.addEventListener("click", () => {
      expRole = btn.dataset.value;
      document
        .querySelectorAll("#export-role-group .export-toggle")
        .forEach((b) => b.classList.toggle("active", b === btn));
      updateExportSummary();
    });
  });

document.querySelectorAll(".export-format-card").forEach((card) => {
  card.addEventListener("click", () => {
    expFormat = card.dataset.value;
    document
      .querySelectorAll(".export-format-card")
      .forEach((c) => c.classList.toggle("active", c === card));
    const checkPdf = document.getElementById("check-pdf");
    const checkXlsx = document.getElementById("check-xlsx");
    if (checkPdf)
      checkPdf.style.display = expFormat === "pdf" ? "flex" : "none";
    if (checkXlsx)
      checkXlsx.style.display = expFormat === "xlsx" ? "flex" : "none";
    updateExportButtonLabel();
  });
});

document
  .querySelectorAll("#export-delivery-group .export-delivery-card")
  .forEach((card) => {
    card.addEventListener("click", () => {
      if (card.dataset.value === "email") {
        showToast(
          "warning",
          "Email delivery unavailable",
          "Email delivery is not enabled for this installation. Please use Download instead."
        );
        return;
      }

      expDelivery = card.dataset.value;
      document
        .querySelectorAll("#export-delivery-group .export-delivery-card")
        .forEach((c) => c.classList.toggle("active", c === card));
      const radioDl = document.getElementById("radio-download");
      const radioEmail = document.getElementById("radio-email");
      if (radioDl && radioEmail) {
        if (expDelivery === "download") {
          radioDl.style.borderColor = "var(--navy)";
          radioDl.querySelector(".export-delivery-radio-dot").style.display =
            "block";
          radioEmail.style.borderColor = "var(--border)";
          radioEmail.querySelector(".export-delivery-radio-dot").style.display =
            "none";
        } else {
          radioDl.style.borderColor = "var(--border)";
          radioDl.querySelector(".export-delivery-radio-dot").style.display =
            "none";
          radioEmail.style.borderColor = "var(--navy)";
          radioEmail.querySelector(".export-delivery-radio-dot").style.display =
            "block";
        }
      }
      if (exportBlazeNotice)
        exportBlazeNotice.style.display =
          expDelivery === "email" ? "flex" : "none";
      updateExportButtonLabel();
    });
  });

exportMonthFrom?.addEventListener("change", () => {
  validateExportMonths();
  updateExportSummary();
});
exportMonthTo?.addEventListener("change", () => {
  validateExportMonths();
  updateExportSummary();
});
exportDateClear?.addEventListener("click", () => {
  if (exportMonthFrom) exportMonthFrom.value = "";
  if (exportMonthTo) exportMonthTo.value = "";
  if (exportDateWarning) exportDateWarning.style.display = "none";
  updateExportSummary();
});

function validateExportMonths() {
  const from = parseInt(exportMonthFrom?.value || "0");
  const to = parseInt(exportMonthTo?.value || "0");
  const invalid = from && to && from > to;
  if (exportDateWarning)
    exportDateWarning.style.display = invalid ? "flex" : "none";
}

function getExportData() {
  let data = [...allMembers];
  if (expRole !== "all") data = data.filter((m) => m.role === expRole);
  const fromMonth = parseInt(exportMonthFrom?.value || "0");
  const toMonth = parseInt(exportMonthTo?.value || "0");
  if (fromMonth || toMonth) {
    data = data.filter((m) => {
      if (!m.dob) return false;
      const birthMonth = parseInt(m.dob.split("-")[1], 10);
      if (fromMonth && birthMonth < fromMonth) return false;
      if (toMonth && birthMonth > toMonth) return false;
      return true;
    });
  }
  return data;
}

function updateExportSummary() {
  const data = getExportData();
  const count = data.length;
  const roleLabel =
    expRole === "all"
      ? "records"
      : expRole === "Member"
      ? "members"
      : "workers";
  if (exportSummaryNum) exportSummaryNum.textContent = count;
  if (exportSummaryLabel) exportSummaryLabel.textContent = roleLabel;
  if (exportSummaryMeta) {
    const MONTH_NAMES = [
      "",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const fromMonth = parseInt(exportMonthFrom?.value || "0");
    const toMonth = parseInt(exportMonthTo?.value || "0");
    const parts = [];
    parts.push(expRole === "all" ? "All roles" : `${expRole}s only`);
    if (fromMonth && toMonth)
      parts.push(
        `Born in: ${MONTH_NAMES[fromMonth]} – ${MONTH_NAMES[toMonth]}`
      );
    else if (fromMonth) parts.push(`Born from ${MONTH_NAMES[fromMonth]}`);
    else if (toMonth) parts.push(`Born up to ${MONTH_NAMES[toMonth]}`);
    else parts.push("All birth months");
    exportSummaryMeta.textContent = parts.join("  ·  ");
  }
}

function updateExportButtonLabel() {
  if (!exportRunText) return;
  const fmt = expFormat === "pdf" ? "PDF" : "Excel";
  const action = expDelivery === "email" ? "Send" : "Export";
  exportRunText.textContent = `${action} ${fmt}`;
}

exportRunBtn?.addEventListener("click", async () => {
  const data = getExportData();
  if (data.length === 0) {
    showToast(
      "warning",
      "Nothing to export",
      "No records match the selected filters."
    );
    return;
  }

  exportRunBtn.disabled = true;
  exportRunText.style.display = "none";
  exportRunSpinner.style.display = "inline-block";

  const roleLabel =
    expRole === "all"
      ? "All-Members"
      : expRole === "Member"
      ? "Members"
      : "Workers";
  const dateTag = buildExportDateTag();
  const filename = `RCCG-Immanuel_${roleLabel}${dateTag}`;

  try {
    if (expFormat === "pdf") await exportPDF(data, filename, roleLabel);
    else exportXLSX(data, filename, roleLabel);
    pushExportHistory(filename, expFormat, data.length, "Downloaded");
    showToast(
      "success",
      "Export complete",
      `${data.length} records saved as ${expFormat.toUpperCase()}.`
    );
  } catch (err) {
    console.error("Export error:", err);
    showToast(
      "error",
      "Export failed",
      "Could not generate the file. Please try again."
    );
  } finally {
    exportRunBtn.disabled = false;
    exportRunText.style.display = "inline";
    exportRunSpinner.style.display = "none";
  }
});

function buildExportDateTag() {
  const MONTH_ABBR = [
    "",
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const from = parseInt(exportMonthFrom?.value || "0");
  const to = parseInt(exportMonthTo?.value || "0");
  if (!from && !to) return "";
  if (from && !to) return `_from-${MONTH_ABBR[from]}`;
  if (!from && to) return `_to-${MONTH_ABBR[to]}`;
  return `_${MONTH_ABBR[from]}-to-${MONTH_ABBR[to]}`;
}

// ══════════════════════════════════════════════════════════════
//  PDF EXPORT
// ══════════════════════════════════════════════════════════════
async function exportPDF(data, filename, roleLabel) {
  if (!window.jspdf)
    throw new Error("jsPDF CDN failed. Check your internet connection.");
  const { jsPDF } = window.jspdf;
  const pdfDoc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });
  const pageW = pdfDoc.internal.pageSize.width;

  const NAVY = [15, 33, 71];
  const GOLD = [212, 160, 23];
  const LIGHT = [244, 246, 252];
  const WHITE = [255, 255, 255];
  const MUTED = [138, 148, 168];

  pdfDoc.setFillColor(...NAVY);
  pdfDoc.rect(0, 0, pageW, 26, "F");
  pdfDoc.setFillColor(...GOLD);
  pdfDoc.rect(0, 26, pageW, 1.5, "F");
  pdfDoc.setTextColor(...WHITE);
  pdfDoc.setFontSize(13);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text("RCCG Immanuel — Mega Parish Youth Province 13", 18, 11);
  pdfDoc.setFontSize(8);
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.setTextColor(...GOLD);
  pdfDoc.text("Parish Admin System  ·  Member Export Report", 18, 18);

  const generatedAt = new Date().toLocaleString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const MONTH_NAMES_PDF = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const fromMonthNum = parseInt(exportMonthFrom?.value || "0");
  const toMonthNum = parseInt(exportMonthTo?.value || "0");
  const fromLabel = fromMonthNum ? MONTH_NAMES_PDF[fromMonthNum] : "Any";
  const toLabel = toMonthNum ? MONTH_NAMES_PDF[toMonthNum] : "Any";

  pdfDoc.setTextColor(...NAVY);
  pdfDoc.setFontSize(9);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text(`${roleLabel} Export`, 14, 34);
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.setTextColor(74, 85, 120);
  pdfDoc.setFontSize(8);
  pdfDoc.text(`Generated: ${generatedAt}`, 14, 39.5);
  pdfDoc.text(`Birth month range: ${fromLabel} → ${toLabel}`, 14, 44.5);
  pdfDoc.setFillColor(...NAVY);
  pdfDoc.roundedRect(pageW - 55, 29, 42, 18, 3, 3, "F");
  pdfDoc.setTextColor(...GOLD);
  pdfDoc.setFontSize(18);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text(String(data.length), pageW - 34, 41, { align: "center" });
  pdfDoc.setFontSize(7);
  pdfDoc.setTextColor(...WHITE);
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.text("TOTAL RECORDS", pageW - 34, 45, { align: "center" });

  const columns = [
    { header: "Birthday", dataKey: "birthday" },
    { header: "Full Name", dataKey: "fullName" },
    { header: "Gender", dataKey: "gender" },
    { header: "Phone", dataKey: "phone" },
    { header: "Email", dataKey: "email" },
    { header: "Role", dataKey: "role" },
    { header: "Department", dataKey: "department" },
  ];

  const rows = data.map((m) => ({
    birthday: formatDayMonth(m.dob),
    fullName: m.fullName || "—",
    gender: m.gender || "—",
    phone: m.phone || "—",
    email: m.email || "—",
    role: m.role || "—",
    department: m.department || "—",
  }));

  pdfDoc.autoTable({
    startY: 52,
    columns,
    body: rows,
    theme: "grid",
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
    },
    alternateRowStyles: { fillColor: LIGHT },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [15, 31, 61],
      cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 42 },
      2: { cellWidth: 16 },
      3: { cellWidth: 28 },
      4: { cellWidth: 52 },
      5: { cellWidth: 18 },
      6: { cellWidth: 30 },
    },
    didParseCell: (h) => {
      if (
        h.section === "body" &&
        h.column.dataKey === "role" &&
        h.cell.raw === "Worker"
      ) {
        h.cell.styles.textColor = [26, 122, 62];
        h.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: (h) => {
      const pH = pdfDoc.internal.pageSize.height;
      pdfDoc.setFillColor(...GOLD);
      pdfDoc.rect(0, pH - 10, pageW, 0.8, "F");
      pdfDoc.setFontSize(7);
      pdfDoc.setTextColor(...MUTED);
      pdfDoc.text(
        `Page ${
          h.pageNumber
        } of ${pdfDoc.internal.getNumberOfPages()}  ·  RCCG Immanuel Parish Admin  ·  Confidential`,
        pageW / 2,
        pH - 6,
        { align: "center" }
      );
    },
  });

  pdfDoc.save(`${filename}.pdf`);
}

// ══════════════════════════════════════════════════════════════
//  EXCEL EXPORT
// ══════════════════════════════════════════════════════════════
function exportXLSX(data, filename, roleLabel) {
  if (!window.XLSX)
    throw new Error("SheetJS CDN failed. Check your internet connection.");
  const XLSX = window.XLSX;
  const generatedAt = new Date().toLocaleString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const MONTH_NAMES_PDF = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const fromMonthNum = parseInt(exportMonthFrom?.value || "0");
  const toMonthNum = parseInt(exportMonthTo?.value || "0");
  const fromLabel = fromMonthNum ? MONTH_NAMES_PDF[fromMonthNum] : "Any";
  const toLabel = toMonthNum ? MONTH_NAMES_PDF[toMonthNum] : "Any";

  const titleRows = [
    ["RCCG Immanuel — Mega Parish Youth Province 13"],
    [`Member Export — ${roleLabel}`],
    [`Generated: ${generatedAt}`],
    [
      `Birthday range: ${fromLabel} → ${toLabel}    |    Total records: ${data.length}`,
    ],
    [],
  ];

  const headers = [
    "Birthday (Day & Month)",
    "Full Name",
    "Gender",
    "Phone",
    "Email",
    "Role",
    "Department",
  ];
  const dataRows = data.map((m) => [
    formatDayMonth(m.dob),
    m.fullName || "",
    m.gender || "",
    m.phone || "",
    m.email || "",
    m.role || "",
    m.department || "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([...titleRows, headers, ...dataRows]);
  ws["!cols"] = [
    { wch: 22 },
    { wch: 30 },
    { wch: 10 },
    { wch: 18 },
    { wch: 36 },
    { wch: 10 },
    { wch: 22 },
  ];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } },
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = expRole === "all" ? "All Members" : expRole + "s";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function pushExportHistory(filename, format, count, delivery) {
  exportSessionHistory.unshift({
    filename,
    format,
    count,
    delivery,
    at: new Date(),
  });
  renderExportHistory();
}

function renderExportHistory() {
  if (!exportHistoryList) return;
  if (exportSessionHistory.length === 0) {
    exportHistoryList.innerHTML = `
      <div class="empty-state small">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <p>No exports yet this session</p>
      </div>`;
    return;
  }
  const pdfSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  const xlsxSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>`;

  exportHistoryList.innerHTML = exportSessionHistory
    .map(
      (e) => `
    <div class="export-history-item">
      <div class="export-history-icon ${e.format}">${
        e.format === "pdf" ? pdfSvg : xlsxSvg
      }</div>
      <div class="export-history-info">
        <div class="export-history-name">${escapeHtml(e.filename)}.${escapeHtml(
        e.format
      )}</div>
        <div class="export-history-meta">${
          e.count
        } records · ${e.at.toLocaleTimeString("en-NG", {
        hour: "2-digit",
        minute: "2-digit",
      })}</div>
      </div>
      <span class="export-history-badge ${e.delivery.toLowerCase()}">${escapeHtml(
        e.delivery
      )}</span>
    </div>`
    )
    .join("");
}

// ══════════════════════════════════════════════════════════════
//  ATTENDANCE PAGE
//  Firestore collection: attendance
//  Document shape: { date, male, female, total, createdAt }
//  setDoc with merge:true so re-entering a date updates in place
// ══════════════════════════════════════════════════════════════
let attendanceData = [];

const attDateInput = document.getElementById("att-date");
const attMaleInput = document.getElementById("att-male");
const attFemaleInput = document.getElementById("att-female");
const attSaveBtn = document.getElementById("att-save-btn");
const attSaveText = document.getElementById("att-save-text");
const attSaveSpinner = document.getElementById("att-save-spinner");

if (attDateInput) attDateInput.value = new Date().toISOString().split("T")[0];

attSaveBtn?.addEventListener("click", async () => {
  const date = attDateInput?.value;
  const male = parseInt(attMaleInput?.value);
  const female = parseInt(attFemaleInput?.value);

  if (!date) {
    showToast("warning", "Date required", "Please select a date.");
    return;
  }
  if (isNaN(male) || male < 0) {
    showToast(
      "warning",
      "Invalid count",
      "Enter a valid male count (0 or more)."
    );
    return;
  }
  if (isNaN(female) || female < 0) {
    showToast(
      "warning",
      "Invalid count",
      "Enter a valid female count (0 or more)."
    );
    return;
  }

  const total = male + female;
  const isNew = !attendanceData.find((r) => r.date === date);

  attSaveBtn.disabled = true;
  if (attSaveText) attSaveText.style.display = "none";
  if (attSaveSpinner) attSaveSpinner.style.display = "inline-block";

  try {
    await setDoc(
      doc(db, "attendance", date),
      { date, male, female, total, createdAt: Timestamp.now() },
      { merge: true }
    );
    showToast(
      "success",
      isNew ? "Attendance saved" : "Record updated",
      `${total} attendees (${male}M / ${female}F) on ${formatDate(date)}.`
    );
    if (attMaleInput) attMaleInput.value = "";
    if (attFemaleInput) attFemaleInput.value = "";
  } catch (err) {
    console.error("Attendance save error:", err);
    showToast("error", "Save failed", "Could not save attendance. Try again.");
  } finally {
    attSaveBtn.disabled = false;
    if (attSaveText) attSaveText.style.display = "inline";
    if (attSaveSpinner) attSaveSpinner.style.display = "none";
  }
});

function startAttendanceListener() {
  const q = query(collection(db, "attendance"), orderBy("date", "asc"));
  unsubscribeAttendance = onSnapshot(
    q,
    (snapshot) => {
      attendanceData = snapshot.docs.map((d) => ({ docId: d.id, ...d.data() }));
      const activePage = document.querySelector(".page.active");
      if (activePage?.id === "page-attendance") renderAttendancePage();
      if (activePage?.id === "page-dashboard") renderGenderQuarterlyChart();
    },
    (err) => console.error("Attendance listener error:", err)
  );
}

function renderAttendancePage() {
  renderAttendanceTable();
  renderAttendanceDetailChart();
}

function renderAttendanceTable() {
  const tbody = document.getElementById("att-table-body");
  if (!tbody) return;

  const sorted = [...attendanceData].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">No records yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = sorted
    .map(
      (r) => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>${r.male ?? "—"}</td>
      <td>${r.female ?? "—"}</td>
      <td><strong>${r.total ?? "—"}</strong></td>
      <td>
        <button class="btn-delete att-delete-btn" data-id="${escapeHtml(
          r.date
        )}" style="padding:4px 10px;font-size:11px;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          Delete
        </button>
      </td>
    </tr>
  `
    )
    .join("");

  tbody.querySelectorAll(".att-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await deleteDoc(doc(db, "attendance", btn.dataset.id));
        showToast("success", "Record deleted", "");
      } catch {
        showToast("error", "Delete failed", "Could not remove the record.");
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════
//  ATTENDANCE DETAIL CHART  (BUG FIX med#8: debounced resize)
// ══════════════════════════════════════════════════════════════
let _attChartResizeTimer = null;

function renderAttendanceDetailChart() {
  const canvas = document.getElementById("att-detail-chart");
  const emptyEl = document.getElementById("att-detail-chart-empty");
  if (!canvas || !emptyEl) return;

  const data = [...attendanceData]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8);

  if (data.length === 0) {
    canvas.style.display = "none";
    emptyEl.style.display = "flex";
    return;
  }
  canvas.style.display = "block";
  emptyEl.style.display = "none";

  _drawAttendanceChart(canvas, data);

  if (!canvas._resizeHandler) {
    canvas._resizeHandler = () => {
      clearTimeout(_attChartResizeTimer);
      _attChartResizeTimer = setTimeout(() => {
        const freshData = [...attendanceData]
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-8);
        _drawAttendanceChart(canvas, freshData);
      }, 150);
    };
    window.addEventListener("resize", canvas._resizeHandler);
  }
}

function _drawAttendanceChart(canvas, data) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth || 600;
  const H = 180;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const NAVY = "#0f2147";
  const GOLD = "#d4a017";
  const BORDER = "#e2e8f5";
  const MUTED = "#8a94a8";
  const PAD_L = 36,
    PAD_R = 10,
    PAD_T = 20,
    PAD_B = 36;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const maxVal = Math.max(
    ...data.map((d) => (d.male ?? 0) + (d.female ?? 0)),
    1
  );
  const yMax = Math.ceil(maxVal / 5) * 5 || 5;

  for (let i = 0; i <= 4; i++) {
    const y = PAD_T + chartH - (i / 4) * chartH;
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(PAD_L + chartW, y);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.font = "10px Sora, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(Math.round((i / 4) * yMax), PAD_L - 4, y + 3);
  }

  const gap = 8;
  const barW = (chartW - gap * (data.length + 1)) / data.length;

  data.forEach((r, i) => {
    const male = r.male ?? 0;
    const female = r.female ?? 0;
    const x = PAD_L + gap + i * (barW + gap);
    const baseY = PAD_T + chartH;
    const maleH = (male / yMax) * chartH;
    const femH = (female / yMax) * chartH;

    if (femH > 0) {
      ctx.fillStyle = GOLD;
      ctx.fillRect(x, baseY - maleH - femH, barW, femH);
    }
    if (maleH > 0) {
      ctx.fillStyle = NAVY;
      ctx.fillRect(x, baseY - maleH, barW, maleH);
    }

    ctx.fillStyle = MUTED;
    ctx.font = "9px Sora, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(formatShortDate(r.date), x + barW / 2, H - PAD_B + 14);
  });

  ctx.fillStyle = NAVY;
  ctx.fillRect(PAD_L + 2, PAD_T - 14, 10, 8);
  ctx.fillStyle = MUTED;
  ctx.font = "9px Sora, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Male", PAD_L + 15, PAD_T - 7);
  ctx.fillStyle = GOLD;
  ctx.fillRect(PAD_L + 50, PAD_T - 14, 10, 8);
  ctx.fillStyle = MUTED;
  ctx.fillText("Female", PAD_L + 63, PAD_T - 7);
}
