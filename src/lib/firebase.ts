
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

if (missingEnvVars.length > 0 && typeof window !== 'undefined') { // Log errors only on the client-side during runtime
  console.error(`
    ############################################################################################
    ERROR: Firebase configuration is incomplete. Missing environment variables:
    ${missingEnvVars.join(', ')}

    Please ensure you have a .env.local file in the root of your project with the
    following Firebase project configuration variables:

    NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
    NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id (Optional, but recommended)

    You can get these values from your Firebase project settings:
    Project Settings > General > Your apps > Web app > SDK setup and configuration
    ############################################################################################
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

let app: FirebaseApp;
let db: Firestore;
// let auth: Auth; // Uncomment if using authentication

// Initialize Firebase only if all required config values are present
// This prevents errors during build or server-side rendering if env vars aren't fully set up yet.
// The error in the console (logged above) will guide the user.
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
       throw new Error(`Firebase initialization failed: ${error instanceof Error ? error.message : String(error)}`);
       // Assign dummy values or handle the error state as needed for your app to degrade gracefully
       // For example:
       // app = null as any; // Or some placeholder app object
       // db = null as any;
       // auth = null as any;
    }
} else {
    // Assign dummy values if initialization is skipped due to missing vars
    // This allows the app to potentially build/run without crashing immediately,
    // relying on the console error for user correction.
    console.warn("Firebase initialization skipped due to missing environment variables.");
    app = null as any; // Or handle appropriately
    db = null as any;
    // auth = null as any;
}


export { db, app /*, auth */ };
