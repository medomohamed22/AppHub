import {
  allowMethods,
  cleanText,
  db,
  handleError,
  json,
  requireUser,
  safeUrl
} from './_lib.js';

const categories = new Set(['Shop', 'AI', 'Games', 'Business', 'Tools', 'Finance', 'Social', 'Sports']);

function validateAppPayload(body) {
  const name = cleanText(body.name, 80);
  const category = cleanText(body.category, 30);
  const network = cleanText(body.network, 10);
  const short_description = cleanText(body.shortDescription, 500);
  const developer_name = cleanText(body.developerName, 100);
  const contact_email = cleanText(body.contactEmail, 160).toLowerCase();
  const website_url = safeUrl(body.websiteUrl);
  const icon_url = safeUrl(body.iconUrl);
  const screenshot_urls = Array.isArray(body.screenshotUrls)
    ? body.screenshotUrls.map(safeUrl)
    : [];

  if (
    !name ||
    !short_description ||
    short_description.length < 10 ||
    !developer_name ||
    !categories.has(category) ||
    !['mainnet', 'testnet'].includes(network) ||
    screenshot_urls.length < 1 ||
    screenshot_urls.length > 3
  ) {
    const error = new Error('INVALID_APP_DATA');
    throw error;
  }

  return {
    name,
    category,
    network,
    short_description,
    website_url,
    icon_url,
    screenshot_urls,
    developer_name,
    contact_email,
    status: 'pending'
  };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;

  try {
    const user = await requireUser(req);
    const { paymentId, txid, app } = req.body || {};

    if (!paymentId || !txid) {
      return json(res, 400, { error: 'Missing paymentId or txid' });
    }

    if (!app || typeof app !== 'object') {
      return json(res, 400, { error: 'Missing app submission data' });
    }

    const appData = validateAppPayload(app);
    const supabase = db();

    // Idempotency: if this payment already created an app, return it instead of duplicating it.
    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from('payments')
      .select('id, status, app_id, purpose')
      .eq('payment_id', paymentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingPaymentError) throw existingPaymentError;

    if (existingPayment?.app_id) {
      const { data: existingApp, error: existingAppError } = await supabase
        .from('apps')
        .select('*')
        .eq('id', existingPayment.app_id)
        .eq('owner_id', user.id)
        .single();

      if (existingAppError) throw existingAppError;
      return json(res, 200, { completed: true, app: existingApp, alreadySubmitted: true });
    }

    if (!existingPayment || existingPayment.purpose !== 'app_submission') {
      return json(res, 400, { error: 'Payment was not approved for an app submission' });
    }

    const key = process.env.PI_SECRET_KEY;
    if (!key) throw new Error('PI_SECRET_KEY is not configured');

    const response = await fetch(
      `https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/complete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Key ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ txid })
      }
    );

    const piData = await response.json().catch(() => null);

    if (!response.ok) {
      return json(res, response.status, {
        error: piData?.error || piData || 'Pi complete request failed'
      });
    }

    const { data: createdApp, error: appError } = await supabase
      .from('apps')
      .insert({ owner_id: user.id, ...appData })
      .select('*')
      .single();

    if (appError) throw appError;

    const { error: paymentError } = await supabase
      .from('payments')
      .update({
        app_id: createdApp.id,
        txid,
        status: 'completed',
        raw_response: piData,
        completed_at: new Date().toISOString()
      })
      .eq('payment_id', paymentId)
      .eq('user_id', user.id);

    if (paymentError) {
      // The app exists, so do not make the user pay again. Log the linking problem for repair.
      console.error('Payment completed and app created, but payment linking failed:', paymentError);
    }

    return json(res, 201, {
      completed: true,
      app: createdApp,
      paymentLinked: !paymentError
    });
  } catch (error) {
    if (error.message === 'INVALID_APP_DATA') {
      return json(res, 400, { error: 'Complete required fields, logo, and upload between 1 and 3 screenshots' });
    }
    return handleError(error, res, 'Unable to complete payment and submit app');
  }
}
