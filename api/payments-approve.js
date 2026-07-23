import { allow, approvePiPayment, db, json, requireUser, safeError, schemas } from "./_lib/core.js";
export default async function handler(req, res) {
  if (!allow(req, res, ["POST"])) return;
  try {
    const auth = await requireUser(req);
    const input = schemas.approve.parse(req.body);
    const client = db();
    const [{ data: post }, { data: pkg }] = await Promise.all([
      client.from("posts").select("id,user_id").eq("id", input.postId).eq("user_id", auth.id).single(),
      client.from("promotion_packages").select("*").eq("id", input.packageId).eq("is_active", true).single()
    ]);
    if (!post) throw Object.assign(new Error("لا يمكنك ترويج هذا المنشور."), { status: 403 });
    if (!pkg) throw new Error("الباقة غير متاحة.");
    const approved = await approvePiPayment(input.paymentId);
    if (Math.abs(Number(approved.amount) - Number(pkg.amount_pi)) > 0.0000001) {
      throw Object.assign(new Error("مبلغ الدفع غير مطابق."), { status: 409 });
    }
    const { error } = await client.from("pi_payments").upsert({
      payment_id: input.paymentId, user_id: auth.id, post_id: input.postId,
      package_id: input.packageId, amount: pkg.amount_pi, status: "approved",
      developer_approved: true, raw_payment: approved
    }, { onConflict: "payment_id" });
    if (error) throw error;
    return json(res, 200, { success: true });
  } catch (error) {
    return json(res, error.status || 400, { error: safeError(error) });
  }
}
