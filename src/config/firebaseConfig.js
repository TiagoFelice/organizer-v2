import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

// Your Firebase configuration - update with your actual values
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDExample",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "example.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "example-project",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "example.appspot.com",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abc123",
};

let app = null;
let db = null;
let firebaseInitialized = false;
let firebaseError = null;

try {
  // Initialize Firebase
  app = initializeApp(firebaseConfig);

  // Initialize Firestore
  db = getFirestore(app);
  firebaseInitialized = true;

  // Use emulator in development if enabled
  if (
    import.meta.env.MODE === "development" &&
    !import.meta.env.VITE_DISABLE_EMULATOR
  ) {
    try {
      connectFirestoreEmulator(db, "localhost", 8080);
      console.log("Using Firestore Emulator");
    } catch (error) {
      if (!error.message.includes("already")) {
        console.log(
          "Firestore Emulator not available, using production Firestore",
        );
      }
    }
  }
} catch (error) {
  console.warn("Firebase initialization failed:", error.message);
  firebaseError = error;
  console.log("App will work with localStorage only");
}

export { db, firebaseInitialized, firebaseError };
export default app;
