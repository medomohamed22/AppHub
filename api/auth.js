// api/auth.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { accessToken } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: 'Access Token مطلوب' });
  }

  const apiKey = process.env.PI_API_KEY;
  const baseUrl = process.env.PI_API_BASE_URL || 'https://api.minepi.com/v2';

  if (!apiKey) {
    return res.status(500).json({ error: 'مفتاح PI_API_KEY غير معرف في متغيّرات البيئة' });
  }

  try {
    const response = await fetch(`${baseUrl}/me`, {
      headers: {
        'Authorization': `Key ${apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Pi API Response Error:", errorText);
      return res.status(response.status).json({ error: 'فشل التحقق من بيانات المستخدم عبر Pi Network' });
    }

    const userData = await response.json();
    
    // هنا يتم حفظ البيانات أو إنشاء جلسة للمستخدم
    return res.status(200).json({ success: true, user: userData });

  } catch (error) {
    console.error("Auth Server Error:", error);
    return res.status(500).json({ error: 'حدث خطأ داخلي في الخادم أثناء التوثيق' });
  }
}
