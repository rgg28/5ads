// Importa las librerías de Firebase que necesitas
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-analytics.js";

// TU CONFIGURACIÓN DE FIREBASE (¡Reemplaza con tus valores reales!)
const firebaseConfig = {
    apiKey: "AIzaSyA_lKB3qbb1iPGNDUA61c1D80xOQHUBXyY",
    authDomain: "ads-86e3b.firebaseapp.com",
    projectId: "ads-86e3b",
    storageBucket: "ads-86e3b.firebasestorage.app",
    messagingSenderId: "14763088267",
    appId: "1:14763088267:web:8c15e0e185c0f6ae9df78e",
    measurementId: "G-LK695TL880"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app); // Inicializa Analytics

// Variables globales
let currentFirebaseUser = null; // Almacena el objeto del usuario autenticado de Firebase Auth
let currentUserData = { // Almacena los datos del usuario de Firestore
    balance: 0,
    adsWatched: 0,
    paypalEmail: ''
};
let isAdLoading = false; // Bandera para evitar que se carguen múltiples anuncios al mismo tiempo
const minRedeemAmount = 0.50; // Asegúrate de que este valor coincida con el de tu Netlify Function

// Referencias a elementos del DOM
const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const registerBtn = document.getElementById('registerBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const paypalEmailInput = document.getElementById('paypalEmailInput');
const updatePaypalBtn = document.getElementById('updatePaypalBtn');
const userEmailDisplay = document.getElementById('userEmailDisplay');
const userBalanceDisplay = document.getElementById('userBalanceDisplay');
const adsWatchedDisplay = document.getElementById('adsWatchedDisplay');
const adContainer = document.getElementById('adContainer');
const viewAdBtn = document.getElementById('viewAdBtn');
const redeemBtn = document.getElementById('redeemBtn');
const minRedeemAmountDisplay = document.getElementById('minRedeemAmountDisplay');


// --- Funciones de Interfaz de Usuario (UI) ---

// Actualiza el display de la UI con los datos del usuario
function updateAppUI() {
    if (currentFirebaseUser && currentUserData) {
        userEmailDisplay.textContent = currentFirebaseUser.email;
        userBalanceDisplay.textContent = `$${currentUserData.balance.toFixed(2)}`;
        adsWatchedDisplay.textContent = `${currentUserData.adsWatched} anuncios vistos`;
        paypalEmailInput.value = currentUserData.paypalEmail || '';
        minRedeemAmountDisplay.textContent = `$${minRedeemAmount.toFixed(2)}`;
        redeemBtn.disabled = currentUserData.balance < minRedeemAmount;
    } else {
        userEmailDisplay.textContent = 'No autenticado';
        userBalanceDisplay.textContent = '$0.00';
        adsWatchedDisplay.textContent = '0 anuncios vistos';
        paypalEmailInput.value = '';
        minRedeemAmountDisplay.textContent = `$${minRedeemAmount.toFixed(2)}`;
        redeemBtn.disabled = true;
    }
}

// Muestra u oculta secciones de la UI
function setupAuthUI(user) {
    if (user) {
        loginSection.style.display = 'none';
        appSection.style.display = 'block';
        loadUserData(user.uid);
    } else {
        loginSection.style.display = 'block';
        appSection.style.display = 'none';
        userEmailDisplay.textContent = 'No autenticado';
        userBalanceDisplay.textContent = '$0.00';
        adsWatchedDisplay.textContent = '0 anuncios vistos';
        paypalEmailInput.value = '';
        currentUserData = { balance: 0, adsWatched: 0, paypalEmail: '' };
    }
}

// --- Funciones de Autenticación ---

// Observador de estado de autenticación de Firebase
onAuthStateChanged(auth, (user) => {
    currentFirebaseUser = user;
    setupAuthUI(user);
    if (user) {
        logEvent(analytics, 'login', { method: 'email', user_id: user.uid });
    } else {
        logEvent(analytics, 'logout');
    }
});

async function registerUser() {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        alert('Por favor, ingresa un email y una contraseña.');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await setDoc(doc(db, 'users', user.uid), {
            paypalEmail: '',
            balance: 0,
            adsWatched: 0,
            createdAt: new Date()
        });
        alert('Registro exitoso. ¡Bienvenido!');
        logEvent(analytics, 'sign_up', { method: 'email', user_id: user.uid });
    } catch (error) {
        console.error("Error al registrar:", error);
        alert('Error al registrar: ' + error.message);
        logEvent(analytics, 'sign_up_failed', { error_message: error.message });
    }
}

async function loginUser() {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        alert('Por favor, ingresa un email y una contraseña.');
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        alert('Inicio de sesión exitoso.');
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        alert('Error al iniciar sesión: ' + error.message);
        logEvent(analytics, 'login_failed', { error_message: error.message });
    }
}

async function logoutUser() {
    try {
        await signOut(auth);
        alert('Sesión cerrada.');
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        alert('Error al cerrar sesión: ' + error.message);
    }
}

// --- Funciones de Datos de Usuario (Firestore) ---

// Carga los datos del usuario y se suscribe a cambios en tiempo real
function loadUserData(userId) {
    const userDocRef = doc(db, 'users', userId);
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            currentUserData = docSnap.data();
            updateAppUI();
        } else {
            console.warn("Documento de usuario no encontrado en Firestore.");
            currentUserData = { balance: 0, adsWatched: 0, paypalEmail: '' };
            updateAppUI();
        }
    }, (error) => {
        console.error("Error al obtener datos de usuario en tiempo real:", error);
        alert("Error al cargar tus datos. Inténtalo de nuevo más tarde.");
    });
}

async function updatePaypalEmail() {
    if (!currentFirebaseUser) {
        alert('Por favor, inicia sesión para actualizar tu email de PayPal.');
        return;
    }
    const newEmail = paypalEmailInput.value.trim();
    if (!newEmail || !newEmail.includes('@')) {
        alert('Por favor, ingresa un email de PayPal válido.');
        return;
    }
    if (newEmail === currentUserData.paypalEmail) {
        alert('El email de PayPal es el mismo.');
        return;
    }

    try {
        const userDocRef = doc(db, 'users', currentFirebaseUser.uid);
        await updateDoc(userDocRef, { paypalEmail: newEmail });
        currentUserData.paypalEmail = newEmail;
        updateAppUI();
        alert('Email de PayPal actualizado con éxito.');
        logEvent(analytics, 'paypal_email_updated', { user_id: currentFirebaseUser.uid });
    } catch (error) {
        console.error("Error al actualizar email de PayPal:", error);
        alert('Error al actualizar email de PayPal: ' + error.message);
        logEvent(analytics, 'paypal_email_update_failed', { error_message: error.message, user_id: currentFirebaseUser.uid });
    }
}

// --- Lógica de Anuncios y Canje (INTEGRADA CON NETLIFY FUNCTIONS) ---

async function showRewardedAd() {
    if (!currentFirebaseUser) {
        alert('Por favor, inicia sesión para ver anuncios.');
        return;
    }
    if (isAdLoading) {
        alert('Un anuncio ya está cargando o en curso. Por favor, espera.');
        return;
    }

    adContainer.textContent = "Cargando anuncio... Por favor, espera.";
    viewAdBtn.disabled = true;
    redeemBtn.disabled = true;
    isAdLoading = true;
    logEvent(analytics, 'ad_request', { user_id: currentFirebaseUser.uid });

    // --- SIMULACIÓN DE ANUNCIO ---
    setTimeout(async () => {
        adContainer.textContent = "¡Anuncio en curso! Por favor, no cierres esta ventana.";

        setTimeout(async () => {
            adContainer.textContent = "Anuncio terminado.";
            try {
                // ** LLAMADA A NETLIFY FUNCTION **
                const response = await fetch('/.netlify/functions/watchAd', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // OPCIONAL Y RECOMENDADO: Envía el ID Token para una verificación más segura en el backend
                        // 'Authorization': `Bearer ${await currentFirebaseUser.getIdToken()}`
                    },
                    body: JSON.stringify({
                        userId: currentFirebaseUser.uid // Envía el UID del usuario
                    })
                });

                const data = await response.json(); // Parsea la respuesta JSON

                if (response.ok) { // Verifica si el status code está en el rango 200-299
                    // Netlify Function ya ha actualizado el balance en Firestore.
                    currentUserData.balance = data.newBalance;
                    currentUserData.adsWatched = data.newAdsWatched;
                    updateAppUI(); // Forzar la actualización inmediata de la UI
                    alert(data.message); // Mensaje desde la Netlify Function
                    logEvent(analytics, 'reward_granted', { amount: data.rewardGranted, total_balance: currentUserData.balance, user_id: currentFirebaseUser.uid });
                } else {
                    // Si la respuesta no es 'ok', significa un error de la función de Netlify
                    alert("Error al ver anuncio: " + (data.message || "Error desconocido."));
                    logEvent(analytics, 'ad_error', { error_message: data.message, status_code: response.status, user_id: currentFirebaseUser.uid });
                }

            } catch (error) {
                console.error("Error al llamar a Netlify Function (watchAd):", error);
                alert("Hubo un error al procesar el anuncio. Detalles: " + error.message);
                logEvent(analytics, 'ad_error', { error_message: error.message, user_id: currentFirebaseUser.uid });
            } finally {
                adContainer.textContent = "Listo para el próximo anuncio.";
                viewAdBtn.disabled = false;
                redeemBtn.disabled = currentUserData.balance < minRedeemAmount;
                isAdLoading = false;
            }
        }, 5000); // Duración de la simulación del anuncio (5 segundos)
    }, 2000); // Retraso antes de que el "anuncio" comience (2 segundos)
}

async function handleRedeem() {
    if (!currentFirebaseUser) {
        alert('Por favor, inicia sesión para canjear.');
        return;
    }

    const userDocRef = doc(db, 'users', currentFirebaseUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
        currentUserData = userDocSnap.data();
    } else {
        alert('No se pudieron cargar tus datos de balance. Inténtalo de nuevo.');
        logEvent(analytics, 'redeem_failed', { reason: 'user_data_not_found', user_id: currentFirebaseUser.uid });
        return;
    }

    if (currentUserData.balance < minRedeemAmount) {
        alert(`Necesitas al menos $${minRedeemAmount.toFixed(2)} para canjear. Tienes $${currentUserData.balance.toFixed(2)}. ¡Sigue viendo anuncios!`);
        logEvent(analytics, 'redeem_failed', { reason: 'insufficient_balance', balance: currentUserData.balance, user_id: currentFirebaseUser.uid });
        return;
    }

    const confirmRedeem = confirm(
        `Estás a punto de canjear $${currentUserData.balance.toFixed(2)} USD.\n` +
        `Este monto será enviado a tu email de PayPal registrado: ${currentUserData.paypalEmail}.\n\n` +
        `¿Confirmas la solicitud de canje?`
    );

    if (!confirmRedeem) {
        logEvent(analytics, 'redeem_cancelled', { user_id: currentFirebaseUser.uid });
        return;
    }

    try {
        // ** LLAMADA A NETLIFY FUNCTION **
        const response = await fetch('/.netlify/functions/requestRedeem', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // OPCIONAL Y RECOMENDADO: Envía el ID Token para una verificación más segura en el backend
                // 'Authorization': `Bearer ${await currentFirebaseUser.getIdToken()}`
            },
            body: JSON.stringify({
                userId: currentFirebaseUser.uid // Envía el UID del usuario
            })
        });

        const data = await response.json(); // Parsea la respuesta JSON

        if (response.ok) { // Verifica si el status code está en el rango 200-299
            // Netlify Function ha procesado la solicitud y reseteado el balance
            currentUserData.balance = 0;
            currentUserData.adsWatched = 0;
            updateAppUI();
            alert(data.message);
            logEvent(analytics, 'redeem_request_submitted', { amount: data.redeemedAmount, paypal_email: data.paypalEmail, user_id: currentFirebaseUser.uid });
        } else {
            // Si la respuesta no es 'ok', significa un error de la función de Netlify
            alert("Error al canjear: " + (data.message || "Error desconocido."));
            logEvent(analytics, 'redeem_error', { error_message: data.message, status_code: response.status, user_id: currentFirebaseUser.uid });
        }

    } catch (error) {
        console.error("Error al llamar a Netlify Function (requestRedeem):", error);
        alert("Hubo un error al procesar tu solicitud de canje. Detalles: " + error.message);
        logEvent(analytics, 'redeem_error', { error_message: error.message, user_id: currentFirebaseUser.uid });
    }
}

// --- Listeners de Eventos ---
registerBtn.addEventListener('click', registerUser);
loginBtn.addEventListener('click', loginUser);
logoutBtn.addEventListener('click', logoutUser);
updatePaypalBtn.addEventListener('click', updatePaypalEmail);
viewAdBtn.addEventListener('click', showRewardedAd);
redeemBtn.addEventListener('click', handleRedeem);

// Inicializar UI al cargar la página
updateAppUI();