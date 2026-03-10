const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI || "";
const jwtSecret = process.env.JWT_SECRET || "docforge-dev-secret-change-me";
const internalApiToken = process.env.INTERNAL_API_TOKEN || "docforge-internal-token-change-me";

const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

function signAppToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email || "",
      name: user.name || "",
      provider: user.provider || "google"
    },
    jwtSecret,
    { expiresIn: "7d" }
  );
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return "";
  }
  return header.slice("Bearer ".length).trim();
}

function verifyAppToken(token) {
  return jwt.verify(token, jwtSecret);
}

function signOAuthState(payload) {
  return jwt.sign(payload, jwtSecret, { expiresIn: "10m" });
}

function verifyOAuthState(token) {
  return jwt.verify(token, jwtSecret);
}

function authRequired(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "authentication required" });
    }

    const decoded = verifyAppToken(token);
    req.auth = {
      userId: String(decoded.sub),
      email: decoded.email || "",
      name: decoded.name || "",
      provider: decoded.provider || "google"
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "invalid authentication token" });
  }
}

function internalOrAuth(req, _res, next) {
  const token = req.headers["x-internal-token"];
  if (token && token === internalApiToken) {
    req.internal = true;
    return next();
  }

  return authRequired(req, _res, next);
}

function internalOnly(req, res, next) {
  const token = req.headers["x-internal-token"];
  if (token && token === internalApiToken) {
    req.internal = true;
    return next();
  }

  return res.status(401).json({ error: "internal token required" });
}

async function verifyGoogleIdToken(idToken) {
  if (!googleClient || !googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: googleClientId
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub) {
    throw new Error("Invalid Google token payload");
  }

  return payload;
}

async function exchangeGoogleCodeForToken(code) {
  if (!googleClientId || !googleClientSecret || !googleRedirectUri) {
    throw new Error("Google OAuth is missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REDIRECT_URI");
  }

  const body = new URLSearchParams({
    code,
    client_id: googleClientId,
    client_secret: googleClientSecret,
    redirect_uri: googleRedirectUri,
    grant_type: "authorization_code"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Failed to exchange Google auth code");
  }

  if (!payload.id_token) {
    throw new Error("Google token response missing id_token");
  }

  return payload;
}

module.exports = {
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
  internalApiToken,
  signAppToken,
  signOAuthState,
  verifyOAuthState,
  exchangeGoogleCodeForToken,
  verifyGoogleIdToken,
  authRequired,
  internalOrAuth,
  internalOnly
};
