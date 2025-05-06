
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
// import { getAuth } from 'firebase/auth'; // Uncomment if you need authentication

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
   // For now, we'll re-throw to make it clear initialization failed.
   // If required env vars were missing, the console error above will provide guidance.
   // If other errors occurred (e.g., invalid config values), this throw will surface it.
    if (missingEnvVars.length > 0) {
         // Avoid throwing if the error is just due to missing env vars during build/server-side
         // The console error is sufficient guidance in that case.
         // If we are client-side and still missing vars, the app likely won't work.
         if (typeof window !== 'undefined') {
             throw new Error(`Firebase initialization failed due to missing environment variables: ${missingEnvVars.join(', ')}. Please check your .env.local file and the browser console.`);
         }
    } else {
        throw new Error(`Firebase initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
   // Assign dummy values or handle the error state as needed for your app to degrade gracefully
   // For example:
   // app = null as any; // Or some placeholder app object
   // db = null as any;
   // auth = null as any;
}


export { db, app /*, auth */ };
