const PLATFORM_API_URL = process.env.PI_PLATFORM_API_URL || "https://api.minepi.com";
const DEALWAY_CANONICAL =
  "DEALWAY:GBQ3H472BMOMTFRSK5P26FBRVOE3ZFCB5F3FTGXEGOV5CN7RAB6TRPJR";

function requireApiKey() {
  if (!process.env.PI_API_KEY) {
    const error = new Error("PI_API_KEY is not configured on Vercel");
    error.statusCode = 500;
    throw error;
  }
}

async function platformRequest(path, options = {}) {
  requireApiKey();

  const response = await fetch(`${PLATFORM_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Key ${process.env.PI_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.message || data.error || `Pi Platform API returned ${response.status}`
    );
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

function getTokenCanonical(payment) {
  if (typeof payment?.tokenCanonical === "string") return payment.tokenCanonical;
  if (typeof payment?.token_canonical === "string") return payment.token_canonical;

  const code =
    payment?.token?.code ||
    payment?.asset?.code ||
    payment?.asset_code;

  const issuer =
    payment?.token?.issuer ||
    payment?.asset?.issuer ||
    payment?.asset_issuer;

  return code && issuer ? `${code}:${issuer}` : null;
}

function validatePayment(payment, expectedAmount, expectedAsset) {
  const actualAmount = Number(payment?.amount);
  const requestedAmount = Number(expectedAmount);

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    const error = new Error("Invalid expected amount");
    error.statusCode = 400;
    throw error;
  }

  // Decimal-safe enough for this test UI; use integer base units in production.
  if (!Number.isFinite(actualAmount) || Math.abs(actualAmount - requestedAmount) > 1e-7) {
    const error = new Error(`Payment amount mismatch: expected ${requestedAmount}, got ${actualAmount}`);
    error.statusCode = 400;
    throw error;
  }

  if (expectedAsset === "DEALWAY") {
    const canonical = getTokenCanonical(payment);
    if (canonical !== DEALWAY_CANONICAL) {
      const error = new Error(
        `Token mismatch. Expected ${DEALWAY_CANONICAL}, got ${canonical || "unknown"}`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  if (expectedAsset !== "PI" && expectedAsset !== "DEALWAY") {
    const error = new Error("Unsupported asset");
    error.statusCode = 400;
    throw error;
  }
}

function sendError(res, error) {
  console.error(error);
  res.status(error.statusCode || 500).json({
    error: "request_failed",
    message: error.message || "Unexpected server error",
    ...(process.env.NODE_ENV !== "production" && error.details
      ? { details: error.details }
      : {}),
  });
}

module.exports = {
  DEALWAY_CANONICAL,
  platformRequest,
  validatePayment,
  sendError,
};
