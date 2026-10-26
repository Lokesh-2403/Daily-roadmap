
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

import {
  getToken,
  onMessage
} from 'firebase/messaging';

const signInButton = document.getElementById('google-sign-in');
const signOutButton = document.getElementById('google-sign-out');
const notificationButton = document.getElementById('enable-notifications');
const statusElement = document.getElementById('account-status');
const messageElement = document.getElementById('account-message');

let activeUid = null;
let cloudReady = false;
let saveTimer = null;
let authGeneration = 0;
let foregroundListenerStarted = false;

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
    throw new Error('Roadmap bridge is missing from index.html.');
  }

  bridge.setCloudState(rooms);
}

function updateNotificationButton() {
  if (!notificationButton) return;

  const user = window.dayymarkkFirebase?.auth?.currentUser;

  notificationButton.hidden = !user;
  notificationButton.disabled = false;

  if (!user) {
    notificationButton.textContent = 'Enable Notifications';
    return;
  }

  if (!('Notification' in window)) {
    notificationButton.textContent = 'Notifications Unsupported';
    notificationButton.disabled = true;
    return;
  }

  if (Notification.permission === 'granted') {
    notificationButton.textContent = 'Refresh Notifications';
  } else if (Notification.permission === 'denied') {
    notificationButton.textContent = 'Notifications Blocked';
    notificationButton.disabled = true;
  } else {
    notificationButton.textContent = 'Enable Notifications';
  }
}

async function enablePushNotifications() {
  const firebase = window.dayymarkkFirebase;
  const user = firebase?.auth?.currentUser;

  if (!user) {
    showMessage('Sign in with Google before enabling notifications.');
    return;
  }

  if (!firebase.messaging) {
    showMessage(
      'Firebase Messaging is unavailable in this browser. Use a supported browser and HTTPS.'
    );
    return;
  }

  if (!('Notification' in window)) {
    showMessage('This browser does not support web notifications.');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    showMessage('This browser does not support service workers.');
    return;
  }

  if (!window.isSecureContext) {
    showMessage(
      'Notifications require HTTPS, or localhost during computer testing.'
    );
    return;
  }

  notificationButton.disabled = true;
  showMessage('Requesting notification permission...');

  try {
    let permission = Notification.permission;

    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      showMessage(
        permission === 'denied'
          ? 'Notifications are blocked. Allow them in your browser site settings.'
          : 'Notification permission was not granted.'
      );
      return;
    }

    showMessage('Registering your notification device...');

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const token = await getToken(firebase.messaging, {
      vapidKey: firebase.vapidKey,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      showMessage(
        'Firebase did not return a notification token. Check your browser settings and Firebase Web Push configuration.'
      );
      return;
    }

    // Prevent saving a token to the wrong account if the user changes accounts.
    if (firebase.auth.currentUser?.uid !== user.uid) {
      showMessage('Your account changed. Please enable notifications again.');
      return;
    }

    const tokenRef = doc(
      firebase.db,
      'users',
      user.uid,
      'pushTokens',
      token
    );

    await setDoc(tokenRef, {
      token,
      platform: 'web',
      updatedAt: serverTimestamp()
    });

    showMessage(
      'Notifications are enabled for this browser, and its token was saved to your Google account.'
    );

    updateNotificationButton();
  } catch (error) {
    console.error('Could not enable push notifications:', error);

    showMessage(
      `Could not enable notifications: ${error.message || error.code || 'Unknown error'}. Check HTTPS, browser permission, Firebase Messaging configuration, and Firestore rules.`
    );
  } finally {
    updateNotificationButton();
  }
}

function setupForegroundMessages(firebase) {
  if (foregroundListenerStarted || !firebase.messaging) return;

  foregroundListenerStarted = true;

  onMessage(firebase.messaging, (payload) => {
    console.log('Firebase foreground message received:', payload);

    const title =
      payload.notification?.title ||
      payload.data?.title ||
      'Dayymarkk';

    const body =
      payload.notification?.body ||
      payload.data?.body ||
      'You have a roadmap task to check.';

    // Display a notification only while this page is visible.
    if (
      document.visibilityState === 'visible' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(title, {
          body,
          icon: '/icon.svg',
          tag: payload.data?.tag || 'dayymarkk-foreground'
        });
      } catch (error) {
        console.warn('Could not display foreground notification:', error);
      }
    }
  });
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

  showStatus(
    `Loading roadmaps for ${user.displayName || user.email || 'your account'}...`
  );
  showMessage('Loading this Google account’s cloud data...');

  try {
    const { db } = window.dayymarkkFirebase;
    const roadmapRef = doc(db, 'users', user.uid, 'roadmaps', 'main');
    const snapshot = await getDoc(roadmapRef);

    if (generation !== authGeneration || activeUid !== user.uid) return;

    const rooms =
      snapshot.exists() && Array.isArray(snapshot.data().rooms)
        ? snapshot.data().rooms
        : [];

    setCloudState(rooms);

    cloudReady = true;
    window.dayymarkkCloudReady = true;
    window.dayymarkkInitialAuthReady = true;

    showStatus(
      `Signed in as ${user.displayName || user.email || 'Google user'}`
    );

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
    ) {
      return;
    }

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
  if (
    !signInButton ||
    !signOutButton ||
    !statusElement ||
    !messageElement
  ) {
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

  setupForegroundMessages(firebase);

  if (notificationButton) {
    notificationButton.addEventListener('click', enablePushNotifications);
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

      updateNotificationButton();

      if (user) {
        signInButton.hidden = true;
        signOutButton.hidden = false;

        if (notificationButton) notificationButton.hidden = false;

        await loadAccount(user, generation);
        updateNotificationButton();
      } else {
        activeUid = null;
        window.dayymarkkCloudAccountUid = null;

        signInButton.hidden = false;
        signOutButton.hidden = true;

        if (notificationButton) {
          notificationButton.hidden = true;
          notificationButton.disabled = false;
          notificationButton.textContent = 'Enable Notifications';
        }

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

function startAccountUIWhenFirebaseReady() {
  if (window.dayymarkkFirebase?.auth && window.dayymarkkFirebase?.db) {
    initializeAccountUI();
    return;
  }

  showStatus('Waiting for Firebase to initialize...');

  window.addEventListener(
    'dayymarkk-firebase-ready',
    initializeAccountUI,
    { once: true }
  );
}

startAccountUIWhenFirebaseReady();
