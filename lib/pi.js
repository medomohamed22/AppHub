// Pi Network SDK Integration (Production Mode)

let isInitializing = false;
let initPromise = null;

/**
 * تهيئة Pi SDK لبيئة الإنتاج الحقيقية
 */
export async function initPiSDK() {
  if (typeof window === 'undefined') return null;

  if (window.Pi) {
    if (!isInitializing && !initPromise) {
      isInitializing = true;
      initPromise = window.Pi.init({ 
        version: "2.0", 
        sandbox: false // تم إيقاف الـ Sandbox تماماً
      }).then(() => {
        isInitializing = false;
        return window.Pi;
      }).catch((err) => {
        isInitializing = false;
        console.error("خطأ في تهيئة Pi SDK:", err);
        throw err;
      });
    }
    return initPromise;
  }

  throw new Error("لم يتم تحميل نص Pi SDK في كائن window.");
}

/**
 * تسجيل دخول المستخدم عبر Pi SDK
 */
export async function authenticatePiUser() {
  try {
    await initPiSDK();
    
    const scopes = ['payments', 'username'];
    
    // التعامل مع العمليات التي لم تكتمل أثناء تسجيل الدخول
    function onIncompletePaymentFound(payment) {
      console.warn("تم العثور على عملية دفع غير مكتملة:", payment);
    }

    const authResult = await window.Pi.authenticate(scopes, onIncompletePaymentFound);
    return authResult;
  } catch (error) {
    console.error("فشل تسجيل الدخول عبر Pi SDK:", error);
    throw error;
  }
}
