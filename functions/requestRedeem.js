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
  }
}

// Obtiene una referencia a Firestore
const db = admin.firestore();

// Constantes de la lógica de recompensas
const MIN_REDEEM_AMOUNT = 0.50; // Monto mínimo para poder solicitar un canje

/**
 * Netlify Function para manejar la solicitud de canje de recompensas.
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

  // 1. Verificar autenticación (presencia del userId)
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
          statusCode: 404,
        };
      }

      const userData = userDoc.data();
      const currentBalance = userData.balance || 0;
      const paypalEmail = userData.paypalEmail;

      // 2. Verificar si el balance es suficiente para canjear y si el email de PayPal es válido
      if (currentBalance < MIN_REDEEM_AMOUNT) {
        return {
          success: false,
          message: `Necesitas al menos $${MIN_REDEEM_AMOUNT.toFixed(2)} para canjear. ` +
            `Tienes $${currentBalance.toFixed(2)}. ¡Sigue viendo anuncios!`,
          statusCode: 403, // Prohibido por falta de fondos.
        };
      }

      if (!paypalEmail || !paypalEmail.includes("@") || paypalEmail.length < 5) {
        return {
          success: false,
          message: "El email de PayPal no está configurado o es inválido en tu perfil.",
          statusCode: 400, // Bad Request debido a argumento inválido.
        };
      }

      // 3. Resetear el balance del usuario y el contador de anuncios vistos
      transaction.update(userRef, {
        balance: 0,
        adsWatched: 0,
        lastRedeemRequestAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: `Solicitud de canje de $${currentBalance.toFixed(2)} USD ` +
          `enviada a ${paypalEmail}. Procesaremos tu pago pronto.`,
        redeemedAmount: currentBalance,
        paypalEmail: paypalEmail,
        statusCode: 200, // Éxito.
      };
    });

    return {
      statusCode: responseData.statusCode,
      body: JSON.stringify(responseData),
      headers: { "Content-Type": "application/json" },
    };
  } catch (error) {
    console.error("Error en requestRedeem Netlify Function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno al procesar la solicitud de canje.",
        error: error.message,
      }),
      headers: { "Content-Type": "application/json" },
    };
  }
};