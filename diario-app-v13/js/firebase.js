// js/firebase.js
// Inicialización única de Firebase para toda la app

import { initializeApp }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore }    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyBk7-tQ0bPX1nyMwEQ9SKRnVkXvIC3BJng",
  authDomain:        "diario-app-6b762.firebaseapp.com",
  projectId:         "diario-app-6b762",
  storageBucket:     "diario-app-6b762.firebasestorage.app",
  messagingSenderId: "318906946452",
  appId:             "1:318906946452:web:1bd417fd2f01ca42e63581"
};

const app = initializeApp(firebaseConfig);

export const auth     = getAuth(app);
export const db       = getFirestore(app);
export const provider = new GoogleAuthProvider();
