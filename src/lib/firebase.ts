
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
// import { getAuth } from 'firebase/auth'; // Uncomment if you need authentication

// IMPORTANT: Please ensure you have a .env.local file in the root of your project
// with your Firebase project configuration variables.
// See .env.local.example for the required variables.

// Check if essential environment variables are defined
const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

// Log a warning instead of a large error block if running on the client
// The build process will likely catch this earlier anyway.
if (missingEnvVars.length > 0 && typeof window !== 'undefined') {
  console.warn(`
    Firebase configuration might be incomplete. Missing environment variables:
    ${missingEnvVars.join(', ')}
    Please check your .env.local file.
  `);
}


const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID // Optional
};

let app: FirebaseApp | null = null; // Initialize as null
let db: Firestore | null = null;   // Initialize as null
// let auth: Auth | null = null; // Uncomment if using authentication, initialize as null

// Initialize Firebase only if all required config values are present
if (missingEnvVars.length === 0) {
    try {
      if (!getApps().length) {
        app = initializeApp(firebaseConfig);
      } else {
        app = getApps()[0];
      }

      db = getFirestore(app);
      // auth = getAuth(app); // Uncomment if using authentication

    } catch (error) {
       console.error("Firebase initialization failed:", error);
       // Handle the error appropriately - maybe set a global error state?
       // If other errors occurred (e.g., invalid config values), this throw will surface it.
       // Set to null so checks elsewhere can handle the lack of Firebase
       app = null;
       db = null;
       // auth = null;
       // Rethrowing might be appropriate depending on how critical Firebase is at startup
       // throw new Error(`Firebase initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
} else {
    // Log warning if running on the client and vars are missing
    if (typeof window !== 'undefined') {
        console.warn("Firebase initialization skipped due to missing environment variables.");
    }
    // Ensure variables are null if initialization is skipped
    app = null;
    db = null;
    // auth = null;
}


export { db, app /*, auth */ };

