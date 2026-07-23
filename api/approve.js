"use strict";

var helpers = require("./_lib/pi");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    var body = req.body || {};
    if (!body.paymentId) {
      return res.status(400).json({
        ok: false,
        error: "payment_id_required",
        message: "paymentId is required"
      });
    }

    var id = encodeURIComponent(body.paymentId);
    var payment = await helpers.platformRequest("/v2/payments/" + id);

    helpers.validatePayment(
      payment,
      body.expectedAmount,
      body.expectedAsset
    );

    await helpers.platformRequest("/v2/payments/" + id + "/approve", {
      method: "POST",
      body: JSON.stringify({})
    });

    return res.status(200).json({
      ok: true,
      message: "Payment approved"
    });
  } catch (error) {
    return helpers.sendError(res, error);
  }
};
