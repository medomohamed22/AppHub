"use strict";

var helpers = require("./_lib/pi");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    var payment = req.body && req.body.payment;
    var paymentId = payment && payment.identifier;
    var txid = payment && payment.transaction && payment.transaction.txid;

    if (!paymentId || !txid) {
      return res.status(400).json({
        ok: false,
        error: "invalid_incomplete_payment",
        message: "Payment identifier and txid are required"
      });
    }

    var result = await helpers.platformRequest(
      "/v2/payments/" + encodeURIComponent(paymentId) + "/complete",
      {
        method: "POST",
        body: JSON.stringify({ txid: txid })
      }
    );

    return res.status(200).json({
      ok: true,
      message: "Incomplete payment completed",
      payment: result
    });
  } catch (error) {
    return helpers.sendError(res, error);
  }
};
