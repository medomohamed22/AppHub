import { allow, completePiPayment, db, json, requireUser, safeError, schemas } from "./_lib/core.js";
export default async function handler(req, res) {
  if (!allow(req, res, ["POST"])) return;
  try {
    const auth = await requireUser(req);
    const input = schemas.complete.parse(req.body);
    const client = db();
    const { data: stored, error } = await client.from("pi_payments")
      .select("*").eq("payment_id", input.paymentId).eq("user_id", auth.id).single();
    if (error || !stored) throw Object.assign(new Error("عملية الدفع غير مسجلة."), { status: 404 });
    if (stored.status === "completed") return json(res, 200, { success: true, alreadyCompleted: true });

    const completed = await completePiPayment(input.paymentId, input.txid);
    if (!completed.status?.transaction_verified || !completed.status?.developer_completed) {
      throw Object.assign(new Error("لم يكتمل التحقق من المعاملة."), { status: 409 });
    }
    const metadata = completed.metadata || {};
    if (metadata.postId && metadata.postId !== stored.post_id) {
      throw Object.assign(new Error("بيانات الدفع غير مطابقة."), { status: 409 });
    }
    const { data: promotion, error: rpcError } = await client.rpc("complete_promotion_payment", {
      p_payment_id: input.paymentId,
      p_txid: completed.transaction?.txid || input.txid,
      p_raw_payment: completed
    });
    if (rpcError) throw rpcError;
    return json(res, 200, { success: true, promotion });
  } catch (error) {
    return json(res, error.status || 400, { error: safeError(error) });
  }
}
