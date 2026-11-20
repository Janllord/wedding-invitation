
import {
  db,
  auth,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  serverTimestamp,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "./firebase.js";

// AUTHORIZED ADMIN ACCOUNTS
const ADMIN_UIDS = [
  "aAlbTvYHHAhiq9QRyVLdoIJDzt52",
  "6VIzfQBUYmTthCTb4AbblsFbuEP2"
];

// HTML ELEMENTS
const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");

const syncRsvpButton = document.getElementById("syncRsvpButton");
const finalizeButton = document.getElementById("finalizeButton");
const generatePassesButton = document.getElementById("generatePassesButton");
const publishButton = document.getElementById("publishButton");

const acceptedCount = document.getElementById("acceptedCount");
const publishedCount = document.getElementById("publishedCount");
const passCount = document.getElementById("passCount");

const syncMessage = document.getElementById("syncMessage");
const finalizeMessage = document.getElementById("finalizeMessage");
const passMessage = document.getElementById("passMessage");
const publishMessage = document.getElementById("publishMessage");
const replacementMessage = document.getElementById("replacementMessage");
const dashboardMessage = document.getElementById("dashboardMessage");

const guestSearch = document.getElementById("guestSearch");
const qrPassPreview = document.getElementById("qrPassPreview");
const qrPassList = document.getElementById("qrPassList");
const qrPreviewMessage = document.getElementById("qrPreviewMessage");

// FINAL GUEST REVIEW
const finalGuestReview = document.createElement("div");

finalGuestReview.id = "finalGuestReview";
finalGuestReview.style.cssText = `
  display:none;
  margin-top:20px;
  padding:20px;
  background:#172033;
  border:1px solid #c9a45c;
  border-radius:12px;
`;

finalizeMessage.insertAdjacentElement("afterend", finalGuestReview);

// LOCAL DATA
let syncedGuests = [];
let finalGuestList = [];

let isSyncComplete = false;
let isFinalized = false;
let isGenerating = false;
let isPublishing = false;

// HELPERS
function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function showLogin(message = "") {
  loginSection.style.display = "block";
  dashboardSection.style.display = "none";
  loginMessage.textContent = message;
}

function showDashboard() {
  loginSection.style.display = "none";
  dashboardSection.style.display = "block";
  loginMessage.textContent = "";
}

function isAuthorized(user) {
  return user && ADMIN_UIDS.includes(user.uid);
}

function setButtonLoading(button, loading, normalText) {
  button.disabled = loading;
  button.textContent = loading ? "PLEASE WAIT..." : normalText;
}

// SECURE RANDOM TOKEN
function generateSecureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  let binary = "";

  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// SHA-256 HASH
async function hashToken(token) {
  const encoded = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

// UPDATE ACTIVE PASS COUNT
async function updatePassCount() {
  const snapshot = await getDocs(collection(db, "guestPasses"));

  let activeCount = 0;

  snapshot.forEach(document => {
    if (document.data().status === "active") {
      activeCount++;
    }
  });

  passCount.textContent = activeCount;
}

// VERIFY PUBLISHED GUEST LIST
async function verifyPublishedGuestList() {
  if (!isSyncComplete || !isFinalized) {
    throw new Error("Please sync and finalize the guest list first.");
  }

  for (const guest of syncedGuests) {
    const publishedRef = doc(db, "publishedGuests", guest.guestId);
    const publishedSnapshot = await getDoc(publishedRef);

    if (!publishedSnapshot.exists()) {
      throw new Error(`Guest not published: ${guest.name}`);
    }

    const published = publishedSnapshot.data();

    const expectedEligible = guest.attendance === "Accept";

    if (
      published.name !== guest.name ||
      published.attendance !== guest.attendance ||
      published.eligible !== expectedEligible
    ) {
      throw new Error(
        `Published guest information is outdated: ${guest.name}`
      );
    }
  }

  return true;
}

// DISPLAY FINAL GUEST REVIEW
function displayFinalGuestReview() {
  finalGuestReview.replaceChildren();
  finalGuestReview.style.display = "block";

  const heading = document.createElement("h3");
  heading.textContent = "FINAL GUEST LIST REVIEW";
  heading.style.color = "#d8bd83";

  const description = document.createElement("p");
  description.textContent =
    `${finalGuestList.length} accepted guest(s) are included in this preview.`;

  finalGuestReview.append(heading, description);

  if (!finalGuestList.length) {
    const empty = document.createElement("p");
    empty.textContent = "No accepted guests to display.";
    finalGuestReview.appendChild(empty);
    return;
  }

  finalGuestList.forEach((guest, index) => {
    const row = document.createElement("div");

    row.style.cssText = `
      display:flex;
      justify-content:space-between;
      gap:12px;
      padding:12px 0;
      border-bottom:1px solid #344054;
    `;

    const name = document.createElement("span");
    name.textContent = `${index + 1}. ${guest.name}`;

    const status = document.createElement("span");
    status.textContent = "ACCEPTED";
    status.style.color = "#79d69a";

    row.append(name, status);
    finalGuestReview.appendChild(row);
  });

  const note = document.createElement("p");
  note.textContent =
    "Local preview only. Publish this list before generating QR passes.";

  note.style.cssText =
    "margin-top:15px;color:#c5cad4;font-size:12px;";

  finalGuestReview.appendChild(note);
}

// CREATE QR PASS CARD
function createQRCard(guest, token) {
  const card = document.createElement("div");

  card.style.cssText = `
    background:#0b1120;
    border:1px solid #66552e;
    border-radius:12px;
    padding:18px;
    text-align:center;
  `;

  const name = document.createElement("h3");
  name.textContent = guest.name;

  name.style.cssText = `
    color:#e5c47b;
    font-size:15px;
    margin-bottom:15px;
  `;

  const qrContainer = document.createElement("div");

  qrContainer.style.cssText = `
    display:flex;
    justify-content:center;
    align-items:center;
    min-height:180px;
    background:white;
    padding:10px;
    border-radius:8px;
  `;

  const downloadButton = document.createElement("button");
  downloadButton.textContent = "DOWNLOAD QR PASS";

  downloadButton.style.cssText = `
    width:100%;
    margin-top:15px;
  `;

  card.append(name, qrContainer, downloadButton);
  qrPassList.appendChild(card);

  // NEW QR FORMAT: includes guest ID
  const qrPayload = `WEDDINGPASS:${guest.guestId}:${token}`;

  new QRCode(qrContainer, {
    text: qrPayload,
    width: 180,
    height: 180,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });

  downloadButton.addEventListener("click", () => {
    const canvas = qrContainer.querySelector("canvas");
    const image = qrContainer.querySelector("img");

    let imageURL = "";

    if (canvas) {
      imageURL = canvas.toDataURL("image/png");
    } else if (image && image.src.startsWith("data:image")) {
      imageURL = image.src;
    }

    if (!imageURL) {
      alert("QR image is not ready yet. Please try again.");
      return;
    }

    const link = document.createElement("a");
    link.href = imageURL;
    link.download =
      `Wedding_QR_${guest.name.replace(/[^a-z0-9]/gi, "_")}.png`;

    document.body.appendChild(link);
    link.click();
    link.remove();
  });
}

// ISSUE OR REISSUE QR PASS
async function issueOrReissuePass(guest) {
  const publishedRef = doc(db, "publishedGuests", guest.guestId);
  const passRef = doc(db, "guestPasses", guest.guestId);
  const checkInRef = doc(db, "checkIns", guest.guestId);

  const [publishedSnapshot, passSnapshot, checkInSnapshot] =
    await Promise.all([
      getDoc(publishedRef),
      getDoc(passRef),
      getDoc(checkInRef)
    ]);

  if (!publishedSnapshot.exists()) {
    throw new Error("Guest is not published.");
  }

  const published = publishedSnapshot.data();

  if (
    published.eligible !== true ||
    published.attendance !== "Accept" ||
    published.name !== guest.name
  ) {
    throw new Error("Guest is not eligible for a QR pass.");
  }

  if (checkInSnapshot.exists()) {
    throw new Error("This guest has already checked in. QR cannot be reissued.");
  }

  const existingPass = passSnapshot.exists()
    ? passSnapshot.data()
    : null;

  const action = existingPass && existingPass.status === "active"
    ? "This will invalidate the guest's current QR pass and create a new one."
    : "A new QR pass will be created for this guest.";

  if (!confirm(`${action}\n\nContinue for ${guest.name}?`)) {
    return false;
  }

  const token = generateSecureToken();
  const tokenHash = await hashToken(token);

  await setDoc(passRef, {
    guestId: guest.guestId,
    guestName: guest.name,
    tokenHash,
    status: "active",
    issuedAt: serverTimestamp()
  });

  createQRCard(guest, token);

  await updatePassCount();

  return true;
}

// LOGIN
loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  setButtonLoading(loginButton, true, "SIGN IN");
  loginMessage.textContent = "";

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);

    if (!isAuthorized(result.user)) {
      await signOut(auth);
      showLogin("This account is not authorized for QR Management.");
      return;
    }

    showDashboard();

  } catch (error) {
    console.error("Admin QR login error:", error);
    showLogin("Unable to sign in. Please check your email and password.");

  } finally {
    setButtonLoading(loginButton, false, "SIGN IN");
  }
});

// AUTH STATE
onAuthStateChanged(auth, async user => {
  if (!user) {
    showLogin();
    return;
  }

  if (!isAuthorized(user)) {
    await signOut(auth);
    showLogin("Please use an authorized administrator account.");
    return;
  }

  showDashboard();

  try {
    await updatePassCount();
  } catch (error) {
    console.error("Pass count error:", error);
  }
});

// LOGOUT
logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showLogin();
  } catch (error) {
    console.error("Logout error:", error);
    dashboardMessage.textContent = "Unable to log out. Please try again.";
  }
});

// SYNC RSVP RESPONSES
syncRsvpButton.addEventListener("click", async () => {
  setButtonLoading(syncRsvpButton, true, "SYNC RSVP RESPONSES");

  syncMessage.textContent = "Retrieving guest records and RSVP responses...";
  dashboardMessage.textContent = "";

  isSyncComplete = false;
  isFinalized = false;
  syncedGuests = [];
  finalGuestList = [];

  acceptedCount.textContent = "—";
  finalizeMessage.textContent = "Please sync RSVP responses first.";
  passMessage.textContent = "QR generation requires a published guest list.";
  publishMessage.textContent = "Please prepare the final guest list before publishing.";

  qrPassPreview.style.display = "none";
  qrPassList.replaceChildren();
  finalGuestReview.style.display = "none";
  replacementMessage.textContent = "Search for a guest after syncing.";

  try {
    const [directorySnapshot, responsesSnapshot] = await Promise.all([
      getDocs(collection(db, "guestDirectory")),
      getDocs(collection(db, "rsvpResponses"))
    ]);

    const directoryMap = new Map();

    directorySnapshot.forEach(document => {
      const data = document.data();
      const name = String(data.name || "").trim();
      const normalized = normalizeName(name);

      if (!normalized) return;

      directoryMap.set(normalized, {
        guestId: document.id,
        name
      });
    });

    const latestResponses = new Map();

    responsesSnapshot.forEach(document => {
      const data = document.data();

      if (!Array.isArray(data.guests)) return;

      const submittedAt = data.submittedAt;

      const submittedTime =
        submittedAt && typeof submittedAt.toMillis === "function"
          ? submittedAt.toMillis()
          : 0;

      data.guests.forEach(guestName => {
        const normalized = normalizeName(guestName);

        if (!normalized) return;

        const previous = latestResponses.get(normalized);

        if (!previous || submittedTime > previous.submittedTime) {
          latestResponses.set(normalized, {
            attendance: data.attendance,
            submittedTime
          });
        }
      });
    });

    directoryMap.forEach((guest, normalizedName) => {
      const latest = latestResponses.get(normalizedName);

      syncedGuests.push({
        guestId: guest.guestId,
        name: guest.name,
        attendance: latest ? latest.attendance : "Pending"
      });
    });

    const accepted = syncedGuests.filter(
      guest => guest.attendance === "Accept"
    );

    const declined = syncedGuests.filter(
      guest => guest.attendance === "Decline"
    );

    const pending = syncedGuests.filter(
      guest => guest.attendance === "Pending"
    );

    acceptedCount.textContent = accepted.length;

    syncMessage.textContent =
      `Sync complete. ${syncedGuests.length} invited guests found. ` +
      `${accepted.length} Accept, ${declined.length} Decline, ` +
      `${pending.length} Pending.`;

    isSyncComplete = true;

  } catch (error) {
    console.error("RSVP synchronization error:", error);

    syncMessage.textContent =
      "Unable to synchronize RSVP data. Please check your connection and permissions.";

    dashboardMessage.textContent =
      "RSVP synchronization failed. No guest records were changed.";

  } finally {
    setButtonLoading(syncRsvpButton, false, "SYNC RSVP RESPONSES");
  }
});

// PREPARE FINAL GUEST LIST
finalizeButton.addEventListener("click", () => {
  if (!isSyncComplete) {
    finalizeMessage.textContent =
      "Please synchronize RSVP responses first.";
    return;
  }

  finalGuestList = syncedGuests
    .filter(guest => guest.attendance === "Accept")
    .map(guest => ({
      guestId: guest.guestId,
      name: guest.name,
      eligible: true
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  isFinalized = true;

  finalizeMessage.textContent =
    `${finalGuestList.length} accepted guests prepared for review.`;

  displayFinalGuestReview();

  dashboardMessage.textContent =
    "Review complete. Publish the guest list before generating QR passes.";
});

// PUBLISH FINAL GUEST LIST
publishButton.addEventListener("click", async () => {
  if (!isSyncComplete || !syncedGuests.length) {
    publishMessage.textContent = "Please sync RSVP responses first.";
    return;
  }

  if (!isFinalized) {
    publishMessage.textContent =
      "Please prepare the final guest list first.";
    return;
  }

  if (isPublishing) return;

  isPublishing = true;
  setButtonLoading(publishButton, true, "PUBLISH GUEST LIST");

  publishMessage.textContent = "Publishing guest eligibility...";

  try {
    const batch = writeBatch(db);

    syncedGuests.forEach(guest => {
      const guestRef = doc(db, "publishedGuests", guest.guestId);

      batch.set(guestRef, {
        guestId: guest.guestId,
        name: guest.name,
        attendance: guest.attendance,
        eligible: guest.attendance === "Accept",
        publishedAt: serverTimestamp()
      });
    });

    await batch.commit();

    const accepted = syncedGuests.filter(
      guest => guest.attendance === "Accept"
    ).length;

    publishedCount.textContent = accepted;

    publishMessage.textContent =
      `Successfully published ${syncedGuests.length} guest records. ` +
      `${accepted} eligible for check-in.`;

    dashboardMessage.textContent =
      "Guest eligibility successfully published.";

  } catch (error) {
    console.error("Guest publishing error:", error);

    publishMessage.textContent =
      "Unable to publish guest list. Please check your connection and permissions.";

  } finally {
    isPublishing = false;
    setButtonLoading(publishButton, false, "PUBLISH GUEST LIST");
  }
});

// GENERATE INDIVIDUAL QR PASSES
generatePassesButton.addEventListener("click", async () => {
  if (!isSyncComplete || !isFinalized || !finalGuestList.length) {
    passMessage.textContent =
      "Sync RSVP and prepare the accepted guest list first.";
    return;
  }

  if (isGenerating) return;

  if (typeof QRCode === "undefined") {
    passMessage.textContent =
      "QR library not loaded. Refresh the page and try again.";
    return;
  }

  isGenerating = true;
  setButtonLoading(generatePassesButton, true, "GENERATE QR PASSES");

  qrPassList.replaceChildren();
  qrPassPreview.style.display = "block";
  qrPreviewMessage.textContent = "Verifying publication before generation...";

  let created = 0;
  let existing = 0;
  let failed = 0;
  let checkedIn = 0;

  try {
    await verifyPublishedGuestList();

    qrPreviewMessage.textContent =
      "Published list verified. Generating individual passes...";

    for (const guest of finalGuestList) {
      try {
        const passRef = doc(db, "guestPasses", guest.guestId);
        const checkInRef = doc(db, "checkIns", guest.guestId);

        const [existingPass, existingCheckIn] = await Promise.all([
          getDoc(passRef),
          getDoc(checkInRef)
        ]);

        if (existingCheckIn.exists()) {
          checkedIn++;
          continue;
        }

        if (
          existingPass.exists() &&
          existingPass.data().status === "active"
        ) {
          existing++;
          continue;
        }

        const token = generateSecureToken();
        const tokenHash = await hashToken(token);

        await setDoc(passRef, {
          guestId: guest.guestId,
          guestName: guest.name,
          tokenHash,
          status: "active",
          issuedAt: serverTimestamp()
        });

        createQRCard(guest, token);
        created++;

      } catch (error) {
        console.error(`QR generation failed for ${guest.name}:`, error);
        failed++;
      }
    }

    await updatePassCount();

    qrPreviewMessage.textContent =
      `${created} new QR pass(es) generated. ` +
      `${existing} active pass(es) skipped. ` +
      `${checkedIn} already checked in. ` +
      `${failed} failed.`;

    passMessage.textContent =
      `${created} new pass(es) created.`;

    if (created === 0 && existing > 0) {
      qrPreviewMessage.textContent +=
        " Existing active passes were skipped. Use Guest Replacement to reissue a lost QR.";
    }

  } catch (error) {
    console.error("QR generation error:", error);

    qrPreviewMessage.textContent =
      error.message ||
      "Unable to verify the published guest list. No new QR passes were generated.";

    passMessage.textContent =
      "QR generation stopped. Check publication status.";

  } finally {
    isGenerating = false;
    setButtonLoading(generatePassesButton, false, "GENERATE QR PASSES");
  }
});

// REPLACEMENT SEARCH AND REISSUE
guestSearch.addEventListener("input", () => {
  const searchTerm = normalizeName(guestSearch.value);

  replacementMessage.replaceChildren();

  if (!searchTerm) {
    replacementMessage.textContent = "Enter a guest name to search.";
    return;
  }

  if (!isSyncComplete) {
    replacementMessage.textContent =
      "Please synchronize RSVP responses first.";
    return;
  }

  const matches = syncedGuests.filter(guest =>
    normalizeName(guest.name).includes(searchTerm)
  );

  if (!matches.length) {
    replacementMessage.textContent =
      "No matching invited guest found.";
    return;
  }

  matches.slice(0, 10).forEach(guest => {
    const row = document.createElement("div");

    row.style.cssText = `
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      flex-wrap:wrap;
      padding:12px 0;
      border-bottom:1px solid #344054;
    `;

    const details = document.createElement("span");
    details.textContent = `${guest.name} — ${guest.attendance}`;

    row.appendChild(details);

    if (guest.attendance === "Accept") {
      const reissueButton = document.createElement("button");

      reissueButton.textContent = "REVOKE & REISSUE QR";
      reissueButton.className = "secondary-button";

      reissueButton.addEventListener("click", async () => {
        reissueButton.disabled = true;
        reissueButton.textContent = "PLEASE WAIT...";

        try {
          const issued = await issueOrReissuePass(guest);

          if (issued) {
            replacementMessage.querySelector(".replacement-status")?.remove();

            const status = document.createElement("p");
            status.className = "replacement-status";
            status.style.marginTop = "12px";
            status.textContent =
              `A new QR pass was issued for ${guest.name}. Download it from the QR preview above.`;

            replacementMessage.appendChild(status);
          }

        } catch (error) {
          console.error("QR reissue error:", error);
          alert(error.message || "Unable to reissue this QR pass.");

        } finally {
          reissueButton.disabled = false;
          reissueButton.textContent = "REVOKE & REISSUE QR";
        }
      });

      row.appendChild(reissueButton);
    }

    replacementMessage.appendChild(row);
  });
});

// INITIAL DISPLAY
publishedCount.textContent = "—";
passCount.textContent = "—";
