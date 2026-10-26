
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'firebase/auth';

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';

const signInButton = document.getElementById('google-sign-in');
const signOutButton = document.getElementById('google-sign-out');
const statusElement = document.getElementById('account-status');
const messageElement = document.getElementById('account-message');

let activeUid = null;
let cloudReady = false;
let saveTimer = null;
let authGeneration = 0;

window.dayymarkkCloudAccountUid = null;
window.dayymarkkCloudReady = false;

function showStatus(message) {
  if (statusElement) statusElement.textContent = message;
}

function showMessage(message) {
  if (messageElement) messageElement.textContent = message;
}

function showError(error) {
  console.error('Firebase error:', error);

  const messages = {
    'auth/popup-closed-by-user':
      'The sign-in window was closed before login finished.',
    'auth/popup-blocked':
      'Your browser blocked the sign-in popup. Allow popups and try again.',
    'auth/unauthorized-domain':
      'This website is not authorized in Firebase Authentication.',
    'auth/cancelled-popup-request':
      'Another sign-in popup is already open.',
    'auth/network-request-failed':
      'Network error. Check your internet connection and try again.',
    'permission-denied':
      'Firebase denied access. Check your Firestore security rules.'
  };

  showMessage(
    messages[error.code] ||
    `Something went wrong: ${error.message || error.code || 'Unknown error'}`
  );
}

function getBridge() {
  return window.dayymarkkRoadmaps;
}

function setCloudState(rooms) {
  const bridge = getBridge();

  if (!bridge || typeof bridge.setCloudState !== 'function') {
    throw new Error(
      'Roadmap bridge is missing. Complete the next index.html step.'
    );
  }

  bridge.setCloudState(rooms);
}

async function loadAccount(user, generation) {
  cloudReady = false;
  window.dayymarkkCloudReady = false;
  window.dayymarkkCloudAccountUid = user.uid;
  activeUid = user.uid;

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  showStatus(`Loading roadmaps for ${user.displayName || user.email || 'your account'}...`);
  showMessage('Loading this Google account’s cloud data...');

  try {
    const { db } = window.dayymarkkFirebase;
    const roadmapRef = doc(db, 'users', user.uid, 'roadmaps', 'main');
    const snapshot = await getDoc(roadmapRef);

    // Ignore results if the user changed accounts while loading.
    if (generation !== authGeneration || activeUid !== user.uid) return;

    const rooms = snapshot.exists() && Array.isArray(snapshot.data().rooms)
      ? snapshot.data().rooms
      : [];

    // This bridge will be added to index.html in the next step.
    setCloudState(rooms);

    cloudReady = true;
    window.dayymarkkCloudReady = true;
    window.dayymarkkInitialAuthReady = true;

    showStatus(`Signed in as ${user.displayName || user.email || 'Google user'}`);
    showMessage(
      snapshot.exists()
        ? 'Your roadmaps are loaded from this Google account and will sync as you make changes.'
        : 'This account has no saved roadmaps yet. Create a room or import a roadmap to get started.'
    );
  } catch (error) {
    cloudReady = false;
    window.dayymarkkCloudReady = false;

    console.error('Could not load cloud roadmaps:', error);
    showStatus('Could not load cloud data.');
    showMessage(
      `${error.message || 'Cloud loading failed.'} Your cloud data has not been changed. Refresh and try again after fixing the issue.`
    );
  }
}

window.dayymarkkCloudSave = function (snapshot) {
  if (!cloudReady || !activeUid || !window.dayymarkkFirebase) return;

  const uid = activeUid;
  const generation = authGeneration;

  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    if (
      !cloudReady ||
      activeUid !== uid ||
      generation !== authGeneration
    ) return;

    try {
      const { db } = window.dayymarkkFirebase;
      const roadmapRef = doc(db, 'users', uid, 'roadmaps', 'main');

      await setDoc(roadmapRef, {
        rooms: snapshot.rooms,
        activeRoomId: snapshot.activeRoomId || null,
        updatedAt: serverTimestamp()
      });

      if (activeUid === uid && generation === authGeneration) {
        showMessage('All changes synced to your Google account.');
      }
    } catch (error) {
      console.error('Cloud save failed:', error);

      if (activeUid === uid && generation === authGeneration) {
        showMessage(
          `Cloud sync failed: ${error.message || 'Unknown error'}. Keep this tab open and check your connection.`
        );
      }
    }
  }, 600);
};

function initializeAccountUI() {
  if (!signInButton || !signOutButton || !statusElement || !messageElement) {
    console.error('Account UI elements are missing from index.html.');
    return;
  }

  const firebase = window.dayymarkkFirebase;

  if (!firebase?.auth || !firebase?.db) {
    showStatus('Firebase could not be initialized. Check the console.');
    showMessage('Check firebase-init.js and the browser console.');
    signInButton.disabled = true;
    return;
  }

  signInButton.addEventListener('click', async () => {
    signInButton.disabled = true;
    showMessage('Opening Google sign-in...');

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(firebase.auth, provider);
    } catch (error) {
      showError(error);
    } finally {
      signInButton.disabled = false;
    }
  });

  signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true;

    try {
      await signOut(firebase.auth);
    } catch (error) {
      showError(error);
    } finally {
      signOutButton.disabled = false;
    }
  });

  onAuthStateChanged(
    firebase.auth,
    async (user) => {
      const generation = ++authGeneration;

      cloudReady = false;
      window.dayymarkkCloudReady = false;

      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }

      if (user) {
        signInButton.hidden = true;
        signOutButton.hidden = false;
        await loadAccount(user, generation);
      } else {
        activeUid = null;
        window.dayymarkkCloudAccountUid = null;

        signInButton.hidden = false;
        signOutButton.hidden = true;

        showStatus('Not signed in.');
        getBridge()?.clearSignedOutState?.();
        window.dayymarkkInitialAuthReady = true;
        showMessage(
          'You are using this browser’s local roadmaps. Sign in to load the roadmaps saved to your Google account.'
        );
      }
    },
    (error) => {
      console.error('Authentication state error:', error);
      showStatus('Could not check your sign-in status.');
      showMessage('Refresh the page and try again.');
    }
  );
}

initializeAccountUI();
