import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyATexEm1ulkBAse0mEggSXauKkcbQ0Bm2M",
  authDomain: "church-docs-system.firebaseapp.com",
  projectId: "church-docs-system",
  storageBucket: "church-docs-system.firebasestorage.app",
  messagingSenderId: "59102600506",
  appId: "1:59102600506:web:6c0e36217232902a5d4403",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
