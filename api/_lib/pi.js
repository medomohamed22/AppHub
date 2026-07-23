"use strict";

var PLATFORM_API_URL =
  process.env.PI_PLATFORM_API_URL || "https://api.minepi.com";

var DEALWAY_CANONICAL =
  "DEALWAY:GBQ3H472BMOMTFRSK5P26FBRVOE3ZFCB5F3FTGXEGOV5CN7RAB6TRPJR";

function createError(message, statusCode, details) {
  var error = new Error(message);
  error.statusCode = statusCode || 500;
  error.details = details;
  return error;
}

async function platformRequest(path, options) {
  options = options || {};

  if (!process.env.PI_API_KEY) {
    throw createError(
      "PI_API_KEY غير مضاف في Environment Variables داخل Vercel.",
      500
    );
  }

  var response = await fetch(PLATFORM_API_URL + path, {
    method: options.method || "GET",
    headers: {
      Authorization: "Key " + process.env.PI_API_KEY,
      "Content-Type": "application/json"
    },
    body: options.body
  });

  var data = {};
  try {
    data = await response.json();
  } catch (_) {}

  if (!response.ok) {
    throw createError(
      data.message || data.error || "Pi Platform API error " + response.status,
      response.status,
      data
    );
  }

  return data;
}

function extractCanonical(payment) {
  if (!payment) return null;

  if (typeof payment.tokenCanonical === "string") {
    return payment.tokenCanonical;
  }
  if (typeof payment.token_canonical === "string") {
    return payment.token_canonical;
  }

  var code =
    (payment.token && payment.token.code) ||
    (payment.asset && payment.asset.code) ||
    payment.asset_code ||
    payment.token_code;

  var issuer =
    (payment.token && payment.token.issuer) ||
    (payment.asset && payment.asset.issuer) ||
    payment.asset_issuer ||
    payment.token_issuer;

  return code && issuer ? code + ":" + issuer : null;
}

function validatePayment(payment, expectedAmount, expectedAsset) {
  var actual = Number(payment && payment.amount);
  var expected = Number(expectedAmount);

  if (!isFinite(expected) || expected <= 0) {
    throw createError("Invalid expected amount", 400);
  }

  if (!isFinite(actual) || Math.abs(actual - expected) > 0.0000001) {
    throw createError(
      "Payment amount mismatch. Expected " + expected + ", got " + actual,
      400
    );
  }

  if (expectedAsset !== "PI" && expectedAsset !== "DEALWAY") {
    throw createError("Unsupported asset", 400);
  }

  if (expectedAsset === "DEALWAY") {
    var canonical = extractCanonical(payment);
    if (canonical && canonical !== DEALWAY_CANONICAL) {
      throw createError(
        "Token mismatch. Expected " + DEALWAY_CANONICAL +
          ", got " + canonical,
        400
      );
    }
  }
}

function sendError(res, error) {
  console.error(error);
  return res.status(error.statusCode || 500).json({
    ok: false,
    error: "request_failed",
    message: error.message || "Unexpected server error"
  });
}

module.exports = {
  platformRequest: platformRequest,
  validatePayment: validatePayment,
  sendError: sendError
};
