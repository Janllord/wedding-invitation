
import {
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  collection,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp
} from "./firebase.js";

const adminUIDs = [
  "aAlbTvYHHAhiq9QRyVLdoIJDzt52",
  "6VIzfQBUYmTthCTb4AbblsFbuEP2"
];

const normalizeName = (name) =>
  name.trim().replace(/\s+/g, " ").toUpperCase();

const createGuestId = (name) =>
  normalizeName(name).replace(/[^A-Z0-9-]+/g, "_");

const form = document.getElementById("uploadForm");
const statusMessage = document.getElementById("statusMessage");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    statusMessage.textContent = "Logging in...";

    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (!adminUIDs.includes(credential.user.uid)) {
      await signOut(auth);
      throw new Error("This account is not authorized as an admin.");
    }

    statusMessage.textContent = "Reading existing guest records...";

    const guestsRef = collection(db, "guests");
    const directoryRef = collection(db, "guestDirectory");

    const guestsSnapshot = await getDocs(guestsRef);
    const directorySnapshot = await getDocs(directoryRef);

    const existingDirectoryIds = new Set(
      directorySnapshot.docs.map((guestDoc) => guestDoc.id)
    );

    const newGuests = [];

    guestsSnapshot.forEach((guestDoc) => {
      const name = guestDoc.data().name;

      if (!name) return;

      const guestId = createGuestId(name);

      if (!existingDirectoryIds.has(guestId)) {
        newGuests.push({
          id: guestId,
          name: normalizeName(name)
        });

        existingDirectoryIds.add(guestId);
      }
    });

    if (newGuests.length === 0) {
      statusMessage.textContent =
        "All guest names are already in guestDirectory. No duplicates added.";
      return;
    }

    statusMessage.textContent =
      `Preparing ${newGuests.length} guest names...`;

    const batch = writeBatch(db);

    newGuests.forEach((guest) => {
      const guestRef = doc(directoryRef, guest.id);

      batch.set(guestRef, {
        name: guest.name,
        createdAt: serverTimestamp()
      });
    });

    await batch.commit();

    statusMessage.textContent =
      `Success! ${newGuests.length} guest names copied to guestDirectory.`;

  } catch (error) {
    console.error(error);
    statusMessage.textContent = "Upload failed: " + error.message;
  }
});
