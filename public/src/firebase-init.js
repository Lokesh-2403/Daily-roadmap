
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import {
  getMessaging,
  isSupported
} from 'firebase/messaging';

const firebaseConfig = {
  apiKey: 'AIzaSyBwmAWU4-7N-9gNqcj9YLAHf9l-8QLr5mI',
  authDomain: 'dayymarkk.firebaseapp.com',
  projectId: 'dayymarkk',
  storageBucket: 'dayymarkk.firebasestorage.app',
  messagingSenderId: '456141718501',
  appId: '1:456141718501:web:f80f6530aaed0c0caee50c'
};

const VAPID_KEY = 'BAtKZ1CufHrM9UMYlFq0M38HbOVVOG-cfq3aqhVlX5gUReXNABfr8YDSFFnpLXVu7UdNwxB1gbBrWGxLVBb9if0';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

// Check whether Firebase Messaging is supported.
let messaging = null;

try {
  const supported = await isSupported();

  if (supported) {
    messaging = getMessaging(app);
  }
} catch (error) {
  console.warn(
    'Firebase Messaging is not supported in this browser:',
    error
  );
}

// Make Firebase available to the existing app.
window.dayymarkkFirebase = {
  app,
  auth,
  googleProvider,
  db,
  messaging,
  vapidKey: VAPID_KEY
};
window.dispatchEvent(new Event('dayymarkk-firebase-ready'));

console.log('Dayymarkk Firebase initialized successfully.');
console.log(
  messaging
    ? 'Firebase Messaging is supported.'
    : 'Firebase Messaging is unavailable in this browser.'
);
