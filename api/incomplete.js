const { platformRequest, sendError } = require("./_lib/pi");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const payment = req.body?.payment;
    const paymentId = payment?.identifier;
    const txid = payment?.transaction?.txid;

    if (!paymentId || !txid) {
      return res.status(400).json({
        error: "incomplete_payment_data",
        message: "Payment identifier and transaction id are required",
      });
    }

    const result = await platformRequest(
      `/v2/payments/${encodeURIComponent(paymentId)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ txid }),
      }
    );

    return res.status(200).json({
      ok: true,
      message: "Incomplete payment completed",
      payment: result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};
