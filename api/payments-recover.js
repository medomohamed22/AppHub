import { allow, completePiPayment, db, getPiPayment, json, requireUser, safeError } from "./_lib/core.js";
export default async function handler(req, res) {
  if (!allow(req, res, ["POST"])) return;
  try {
    const auth = await requireUser(req);
    const { paymentId, txid } = req.body || {};
    if (!paymentId) throw new Error("Payment ID is required.");
    const client = db();
    const { data: stored } = await client.from("pi_payments")
      .select("*").eq("payment_id", paymentId).eq("user_id", auth.id).maybeSingle();
    if (!stored) return json(res, 200, { recovered: false, reason: "unknown_payment" });
    if (stored.status === "completed") return json(res, 200, { recovered: true, alreadyCompleted: true });

    const current = txid ? await completePiPayment(paymentId, txid) : await getPiPayment(paymentId);
    const finalTxid = current.transaction?.txid || txid;
    if (current.status?.transaction_verified && current.status?.developer_completed && finalTxid) {
      const { error } = await client.rpc("complete_promotion_payment", {
        p_payment_id: paymentId, p_txid: finalTxid, p_raw_payment: current
      });
      if (error) throw error;
      return json(res, 200, { recovered: true });
    }
    return json(res, 200, { recovered: false, reason: "not_ready" });
  } catch (error) {
    return json(res, error.status || 400, { error: safeError(error) });
  }
}
