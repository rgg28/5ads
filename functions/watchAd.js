// Importa las librerías necesarias de Firebase Admin SDK.
const admin = require("firebase-admin");

// Inicializa el Admin SDK SOLO SI AÚN NO HA SIDO INICIALIZADO.
// Las credenciales DEBEN cargarse desde una variable de entorno segura en Netlify.
// Esta variable (ej. FIREBASE_SERVICE_ACCOUNT_KEY) DEBE contener el JSON
// stringificado de tu archivo de clave de cuenta de servicio de Firebase.
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error("Error al inicializar Firebase Admin SDK:", error);
    // En un entorno de producción, es posible que quieras un manejo de errores más robusto
    // que simplemente loguear, ya que sin SDK, las funciones no funcionarán.
  }
}

// Obtiene una referencia a Firestore
const db = admin.firestore();

// Constantes de la lógica de recompensas
const REWARD_PER_AD_SET = 0.02; // Recompensa por cada ADS_PER_REWARD anuncios
const ADS_PER_REWARD = 5; // Número de anuncios a ver para ganar REWARD_PER_AD_SET

/**
 * Netlify Function para manejar el evento de que un usuario ha visto un anuncio.
 * Esta función es un handler HTTP estándar.
 *
 * @param {object} event - Objeto de evento de la solicitud HTTP. Contiene body, httpMethod, etc.
 * @param {object} context - Objeto de contexto (información sobre el entorno de la función).
 * @returns {object} Respuesta HTTP.
 */
exports.handler = async (event, context) => {
  // Solo acepta solicitudes POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Method Not Allowed" }),
      headers: { "Content-Type": "application/json" },
    };
  }

  let userId;
  let requestBody;

  try {
    requestBody = JSON.parse(event.body);
    // En Firebase Callable Functions, context.auth.uid es automático.
    // Aquí, necesitas que el frontend envíe el userId en el cuerpo o un ID Token.
    // LO IDEAL: Enviar un Firebase ID Token desde el frontend y verificarlo aquí:
    // const idToken = requestBody.idToken;
    // const decodedToken = await admin.auth().verifyIdToken(idToken);
    // userId = decodedToken.uid;
    // Por simplicidad, si no usas ID Tokens, asegúrate de que el userId se envíe:
    userId = requestBody.userId; // Asegúrate de que el frontend envíe { userId: '...' }

  } catch (parseError) {
    console.error("Error al parsear el cuerpo de la solicitud:", parseError);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid JSON body or missing userId." }),
      headers: { "Content-Type": "application/json" },
    };
  }

  // 1. Verificar autenticación (en este caso, la presencia del userId)
  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Authentication required (userId missing)." }),
      headers: { "Content-Type": "application/json" },
    };
  }

  const userRef = db.collection("users").doc(userId);

  try {
    const responseData = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        return {
          success: false,
          message: "Documento de usuario no encontrado. Asegúrate de que tu perfil exista.",
          statusCode: 404, // Un código de estado para este tipo de error.
        };
      }

      const userData = userDoc.data();
      let currentAdsWatched = userData.adsWatched || 0;
      let currentBalance = userData.balance || 0;

      currentAdsWatched += 1;

      let rewardGranted = 0;
      if (currentAdsWatched % ADS_PER_REWARD === 0) {
        currentBalance += REWARD_PER_AD_SET;
        rewardGranted = REWARD_PER_AD_SET;
      }

      transaction.update(userRef, {
        adsWatched: currentAdsWatched,
        balance: currentBalance,
        lastAdWatchedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message:
          rewardGranted > 0 ?
            `¡Anuncio visto! Ganaste $${rewardGranted.toFixed(2)}. ` +
            `Balance total: $${currentBalance.toFixed(2)}.` :
            `Anuncio visto. Faltan ${
              ADS_PER_REWARD - (currentAdsWatched % ADS_PER_REWARD)
            } para la próxima recompensa.`,
        newBalance: currentBalance,
        newAdsWatched: currentAdsWatched,
        rewardGranted: rewardGranted,
        statusCode: 200, // Éxito.
      };
    });

    // Devuelve la respuesta HTTP con el cuerpo JSON
    return {
      statusCode: responseData.statusCode,
      body: JSON.stringify(responseData),
      headers: { "Content-Type": "application/json" },
    };
  } catch (error) {
    console.error("Error en watchAd Netlify Function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno al procesar el anuncio.",
        error: error.message,
      }),
      headers: { "Content-Type": "application/json" },
    };
  }
};