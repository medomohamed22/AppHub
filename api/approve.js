const { platformRequest, validatePayment, sendError } = require("./_lib/pi");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const { paymentId, expectedAmount, expectedAsset } = req.body || {};
    if (!paymentId) {
      return res.status(400).json({ error: "payment_id_required" });
    }

    const payment = await platformRequest(`/v2/payments/${encodeURIComponent(paymentId)}`);
    validatePayment(payment, expectedAmount, expectedAsset);

    await platformRequest(`/v2/payments/${encodeURIComponent(paymentId)}/approve`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    return res.status(200).json({
      ok: true,
      message: `Approved payment ${paymentId}`,
    });
  } catch (error) {
    return sendError(res, error);
  }
};
