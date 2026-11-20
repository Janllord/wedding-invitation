
import {
  auth,
  db,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  doc,
  getDoc,
  collection,
  getDocs,
  runTransaction,
  serverTimestamp
} from "./firebase.js";

// AUTHORIZED STAFF ACCOUNT
const STAFF_UID = "J9p295Y1h4Vo52oxvm5oGE0GWEw1";

// LOGIN ELEMENTS
const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");

const logoutButton = document.getElementById("logoutButton");

const togglePassword = document.getElementById("togglePassword");
const passwordInput = document.getElementById("password");

// SCANNER ELEMENTS
const scanButton = document.getElementById("scanButton");
const stopScanButton = document.getElementById("stopScanButton");
const scanNextButton = document.getElementById("scanNextButton");

const scannerMessage = document.getElementById("scannerMessage");
const scannerControls = document.getElementById("scannerControls");
const qrReader = document.getElementById("qrReader");
const scanResult = document.getElementById("scanResult");

// DASHBOARD ELEMENTS
const checkedInCount = document.getElementById("checkedInCount");
const invitedCount = document.getElementById("invitedCount");
const recentCheckins = document.getElementById("recentCheckins");

// SCANNER STATE
let qrScanner = null;
let scannerIsRunning = false;
let isProcessingScan = false;
let activeDashboardUid = null;

// --------------------------------------------------
// SHOW / HIDE PASSWORD
// --------------------------------------------------

togglePassword.addEventListener("click", () => {

  const isHidden = passwordInput.type === "password";

  passwordInput.type = isHidden ? "text" : "password";

  togglePassword.textContent = isHidden ? "🙈" : "👁";

  togglePassword.setAttribute(
    "aria-label",
    isHidden ? "Hide password" : "Show password"
  );

  togglePassword.setAttribute(
    "title",
    isHidden ? "Hide password" : "Show password"
  );

});

// --------------------------------------------------
// LOGIN / DASHBOARD DISPLAY
// --------------------------------------------------

function showLogin(message = "") {

  loginSection.style.display = "block";
  dashboardSection.style.display = "none";

  loginMessage.textContent = message;

  activeDashboardUid = null;

}

function showDashboard() {

  loginSection.style.display = "none";
  dashboardSection.style.display = "block";

  loginMessage.textContent = "";

}

// --------------------------------------------------
// STAFF LOGIN
// --------------------------------------------------

loginForm.addEventListener("submit", async (event) => {

  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = passwordInput.value;

  loginButton.disabled = true;
  loginButton.textContent = "SIGNING IN...";

  loginMessage.textContent = "";

  try {

    const result = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (result.user.uid !== STAFF_UID) {

      await signOut(auth);

      showLogin(
        "This account is not authorized for Staff Portal."
      );

      return;

    }

    showDashboard();

    await loadDashboardData();

  } catch (error) {

    console.error("Staff login error:", error);

    showLogin(
      "Unable to sign in. Please check your email and password."
    );

  } finally {

    loginButton.disabled = false;
    loginButton.textContent = "SIGN IN";

  }

});

// --------------------------------------------------
// AUTHENTICATION CHECK
// --------------------------------------------------

onAuthStateChanged(auth, async (user) => {

  if (!user) {

    await stopCameraScanner();

    showLogin();

    return;

  }

  if (user.uid !== STAFF_UID) {

    await signOut(auth);

    showLogin(
      "Please sign in using the authorized staff account."
    );

    return;

  }

  showDashboard();

  if (activeDashboardUid !== user.uid) {

    activeDashboardUid = user.uid;

    await loadDashboardData();

  }

});

// --------------------------------------------------
// LOGOUT
// --------------------------------------------------

logoutButton.addEventListener("click", async () => {

  await stopCameraScanner();

  await signOut(auth);

  showLogin();

});

// --------------------------------------------------
// DASHBOARD DATA
// --------------------------------------------------

async function loadDashboardData() {

  try {

    const publishedSnapshot = await getDocs(
      collection(db, "publishedGuests")
    );

    const checkInSnapshot = await getDocs(
      collection(db, "checkIns")
    );

    invitedCount.textContent = publishedSnapshot.size;

    checkedInCount.textContent = checkInSnapshot.size;

    const records = checkInSnapshot.docs.map((item) => ({
      ...item.data(),
      id: item.id
    }));

    records.sort((a, b) => {

      const dateA = a.checkedInAt?.toMillis?.() || 0;
      const dateB = b.checkedInAt?.toMillis?.() || 0;

      return dateB - dateA;

    });

    if (records.length === 0) {

      recentCheckins.textContent =
        "No guests checked in yet.";

      return;

    }

    recentCheckins.style.whiteSpace = "pre-line";

    recentCheckins.textContent = records
      .slice(0, 10)
      .map((item) => {

        const date = item.checkedInAt?.toDate?.();

        const timeText = date
          ? date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            })
          : "Time unavailable";

        return `${item.guestName} — ${timeText}`;

      })
      .join("\n");

  } catch (error) {

    console.error("Dashboard loading error:", error);

    scannerMessage.textContent =
      "Unable to load dashboard information.";

  }

}

// --------------------------------------------------
// SHA-256 TOKEN HASH
// --------------------------------------------------

async function hashToken(token) {

  const encodedToken = new TextEncoder().encode(token);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encodedToken
  );

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

}

// --------------------------------------------------
// DISPLAY SCAN RESULT
// --------------------------------------------------

function displayScanResult(type, heading, message) {

  scanResult.className = `scan-result ${type}`;

  // FIX: Make the result visible after scanning.
  scanResult.style.display = "block";

  scanResult.replaceChildren();

  const title = document.createElement("h3");
  title.textContent = heading;

  const description = document.createElement("p");
  description.textContent = message;

  scanResult.append(title, description);

}

// --------------------------------------------------
// VERIFY AND CHECK IN GUEST
// --------------------------------------------------

async function verifyAndCheckIn(qrText) {

  if (!auth.currentUser || auth.currentUser.uid !== STAFF_UID) {

    displayScanResult(
      "error",
      "UNAUTHORIZED",
      "Please sign in using the authorized staff account."
    );

    return;

  }

  // EXPECTED FORMAT:
  // WEDDINGPASS:guestId:token

  const parts = qrText.split(":");

  if (
    parts.length !== 3 ||
    parts[0] !== "WEDDINGPASS" ||
    !parts[1] ||
    !parts[2]
  ) {

    displayScanResult(
      "error",
      "INVALID QR CODE",
      "This QR code is not a valid wedding pass."
    );

    return;

  }

  const guestId = parts[1];
  const token = parts[2];

  try {

    const scannedTokenHash = await hashToken(token);

    const passRef = doc(db, "guestPasses", guestId);
    const publishedRef = doc(db, "publishedGuests", guestId);
    const checkInRef = doc(db, "checkIns", guestId);

    const staffUid = auth.currentUser.uid;

    const guestName = await runTransaction(
      db,
      async (transaction) => {

        // READ DOCUMENTS FIRST

        const passSnapshot = await transaction.get(passRef);

        const publishedSnapshot = await transaction.get(
          publishedRef
        );

        const checkInSnapshot = await transaction.get(
          checkInRef
        );

        // CHECK DOCUMENT EXISTENCE

        if (!passSnapshot.exists()) {
          throw new Error("INVALID_PASS");
        }

        if (!publishedSnapshot.exists()) {
          throw new Error("GUEST_NOT_FOUND");
        }

        const passData = passSnapshot.data();
        const publishedData = publishedSnapshot.data();

        // CHECK IF ALREADY USED

        if (checkInSnapshot.exists()) {
          throw new Error("ALREADY_CHECKED_IN");
        }

        // CHECK PASS STATUS

        if (passData.status !== "active") {
          throw new Error("PASS_INACTIVE");
        }

        // CHECK TOKEN

        if (passData.tokenHash !== scannedTokenHash) {
          throw new Error("INVALID_TOKEN");
        }

        // CHECK GUEST ELIGIBILITY

        if (
          publishedData.eligible !== true ||
          publishedData.attendance !== "Accept"
        ) {
          throw new Error("NOT_ELIGIBLE");
        }

        // CHECK GUEST NAME

        if (
          !publishedData.name ||
          (
            passData.guestName &&
            passData.guestName !== publishedData.name
          )
        ) {
          throw new Error("GUEST_MISMATCH");
        }

        // CREATE ONE-TIME CHECK-IN

        transaction.set(checkInRef, {

          guestId: guestId,

          guestName: publishedData.name,

          checkedInAt: serverTimestamp(),

          checkedInBy: staffUid

        });

        return publishedData.name;

      }
    );

    displayScanResult(
      "success",
      "✓ CHECK-IN SUCCESSFUL",
      `${guestName} has been successfully checked in.`
    );

    await loadDashboardData();

  } catch (error) {

    console.error("QR verification error:", error);

    const errorMessages = {

      INVALID_PASS:
        "This wedding pass does not exist.",

      GUEST_NOT_FOUND:
        "This guest is not on the published guest list.",

      ALREADY_CHECKED_IN:
        "This guest has already checked in. The QR code cannot be used again.",

      PASS_INACTIVE:
        "This wedding pass has been revoked or is inactive.",

      INVALID_TOKEN:
        "The QR code token is invalid. Please verify the guest's pass.",

      NOT_ELIGIBLE:
        "This guest is not eligible for entry.",

      GUEST_MISMATCH:
        "The guest information does not match the issued pass."

    };

    const message = errorMessages[error.message] ||
      "Unable to verify this QR code. Please try again.";

    displayScanResult(
      "error",
      "✕ CHECK-IN DENIED",
      message
    );

  }

}

// --------------------------------------------------
// START CAMERA SCANNER
// --------------------------------------------------

async function startCameraScanner() {

  if (!auth.currentUser || auth.currentUser.uid !== STAFF_UID) {
    return;
  }

  if (typeof Html5Qrcode === "undefined") {

    scannerMessage.textContent =
      "QR scanner library could not load. Please refresh the page.";

    return;

  }

  scannerMessage.textContent = "";

  scanResult.style.display = "none";

  qrReader.style.display = "block";

  scanButton.style.display = "none";

  scannerControls.style.display = "block";

  stopScanButton.style.display = "block";

  scanNextButton.style.display = "none";

  isProcessingScan = false;

  try {

    qrScanner = new Html5Qrcode("qrReader");

    await qrScanner.start(

      { facingMode: "environment" },

      {
        fps: 10,
        qrbox: {
          width: 250,
          height: 250
        },
        aspectRatio: 1.0
      },

      async (decodedText) => {

        if (isProcessingScan) return;

        isProcessingScan = true;

        await stopCameraScanner();

        qrReader.style.display = "none";

        stopScanButton.style.display = "none";

        scanNextButton.style.display = "block";

        await verifyAndCheckIn(decodedText);

      },

      () => {
        // Ignore normal scanning frame errors.
      }

    );

    scannerIsRunning = true;

    scannerMessage.textContent =
      "Camera is active. Point it at the guest's QR code.";

  } catch (error) {

    console.error("Camera error:", error);

    await stopCameraScanner();

    qrReader.style.display = "none";

    scannerControls.style.display = "none";

    scanButton.style.display = "block";

    scannerMessage.textContent =
      "Unable to access camera. Please allow camera permission and try again.";

  }

}

// --------------------------------------------------
// STOP CAMERA SCANNER
// --------------------------------------------------

async function stopCameraScanner() {

  if (!qrScanner) {
    scannerIsRunning = false;
    return;
  }

  try {

    if (scannerIsRunning) {
      await qrScanner.stop();
    }

  } catch (error) {

    console.warn("Scanner stop warning:", error);

  }

  try {

    await qrScanner.clear();

  } catch (error) {

    console.warn("Scanner clear warning:", error);

  }

  qrScanner = null;

  scannerIsRunning = false;

}

// --------------------------------------------------
// SCANNER BUTTONS
// --------------------------------------------------

scanButton.addEventListener("click", async () => {

  await startCameraScanner();

});

stopScanButton.addEventListener("click", async () => {

  await stopCameraScanner();

  qrReader.style.display = "none";

  scannerControls.style.display = "none";

  scanButton.style.display = "block";

  scannerMessage.textContent =
    "Scanner stopped.";

});

scanNextButton.addEventListener("click", async () => {

  scanResult.style.display = "none";

  await startCameraScanner();

});
