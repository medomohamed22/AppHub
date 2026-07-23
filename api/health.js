"use strict";

module.exports = async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    service: "dealway-pi-payment",
    piApiKeyConfigured: Boolean(process.env.PI_API_KEY),
    platformApiUrl: process.env.PI_PLATFORM_API_URL || "https://api.minepi.com"
  });
};
