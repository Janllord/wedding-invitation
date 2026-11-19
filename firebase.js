
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBV1Eh5e-HGckNoAgDtqVStcSgbw4tfCuQ",
  authDomain: "princess-hu-sheng-wedding.firebaseapp.com",
  projectId: "princess-hu-sheng-wedding",
  storageBucket: "princess-hu-sheng-wedding.firebasestorage.app",
  messagingSenderId: "1071878495733",
  appId: "1:1071878495733:web:7f8c7b416507c8574694bc"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export {
  app,
  db,
  auth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  writeBatch
};
