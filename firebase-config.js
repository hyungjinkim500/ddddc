import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAubNxnFjJrgh1WVfsy8Xc4-fpL5WPoSTY",
  authDomain: "dddc-hyungjin-0726.firebaseapp.com",
  projectId: "dddc-hyungjin-0726",
  storageBucket: "dddc-hyungjin-0726.firebasestorage.app",
  messagingSenderId: "308736358493",
  appId: "1:308736358493:web:ca6cf156337c04ff5835b4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get a reference to the services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage, doc, getDoc, collection, query, where, orderBy, limit, getDocs };
