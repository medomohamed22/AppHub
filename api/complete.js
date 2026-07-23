"use strict";

var helpers = require("./_lib/pi");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    var body = req.body || {};
    if (!body.paymentId || !body.txid) {
      return res.status(400).json({
        ok: false,
        error: "missing_fields",
        message: "paymentId and txid are required"
      });
    }

    var id = encodeURIComponent(body.paymentId);
    var payment = await helpers.platformRequest("/v2/payments/" + id);

    helpers.validatePayment(
      payment,
      body.expectedAmount,
      body.expectedAsset
    );

    var completed = await helpers.platformRequest(
      "/v2/payments/" + id + "/complete",
      {
        method: "POST",
        body: JSON.stringify({ txid: body.txid })
      }
    );

    return res.status(200).json({
      ok: true,
      message: "Payment completed",
      payment: completed
    });
  } catch (error) {
    return helpers.sendError(res, error);
  }
};
