const { platformRequest, validatePayment, sendError } = require("./_lib/pi");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const { paymentId, txid, expectedAmount, expectedAsset } = req.body || {};
    if (!paymentId || !txid) {
      return res.status(400).json({
        error: "payment_id_and_txid_required",
      });
    }

    const payment = await platformRequest(`/v2/payments/${encodeURIComponent(paymentId)}`);
    validatePayment(payment, expectedAmount, expectedAsset);

    const completed = await platformRequest(
      `/v2/payments/${encodeURIComponent(paymentId)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ txid }),
      }
    );

    return res.status(200).json({
      ok: true,
      message: "تم تأكيد عملية الدفع بنجاح.",
      payment: completed,
    });
  } catch (error) {
    return sendError(res, error);
  }
};
