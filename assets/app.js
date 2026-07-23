const DEALWAY_CANONICAL =
  "DEALWAY:GBQ3H472BMOMTFRSK5P26FBRVOE3ZFCB5F3FTGXEGOV5CN7RAB6TRPJR";

const state = {
  user: null,
  accessToken: null,
  paying: false,
};

const el = {
  loginBtn: document.querySelector("#loginBtn"),
  userBox: document.querySelector("#userBox"),
  username: document.querySelector("#username"),
  avatar: document.querySelector("#avatar"),
  paymentCard: document.querySelector("#paymentCard"),
  payBtn: document.querySelector("#payBtn"),
  payLabel: document.querySelector("#payLabel"),
  amount: document.querySelector("#amount"),
  memo: document.querySelector("#memo"),
  tokenDetails: document.querySelector("#tokenDetails"),
  history: document.querySelector("#history"),
  emptyHistory: document.querySelector("#emptyHistory"),
  clearHistory: document.querySelector("#clearHistory"),
  status: document.querySelector("#status"),
};

function showStatus(message, type = "") {
  el.status.textContent = message;
  el.status.className = `status ${type}`.trim();
}

function hideStatus() {
  el.status.className = "status hidden";
}

function selectedAsset() {
  return document.querySelector('input[name="asset"]:checked').value;
}

function updateAssetUI() {
  const asset = selectedAsset();
  document.querySelectorAll(".asset-option").forEach((option) => {
    option.classList.toggle("selected", option.querySelector("input").checked);
  });
  el.tokenDetails.classList.toggle("hidden", asset !== "DEALWAY");
  updatePayLabel();
}

function updatePayLabel() {
  const amount = el.amount.value || "0";
  const asset = selectedAsset() === "PI" ? "Test‑Pi" : "DEALWAY";
  el.payLabel.textContent = `ادفع ${amount} ${asset}`;
}

function setAuthenticated(user, accessToken) {
  state.user = user;
  state.accessToken = accessToken;
  el.username.textContent = user.username || user.uid || "Pi User";
  el.avatar.textContent = (user.username || "P").charAt(0).toUpperCase();
  el.loginBtn.classList.add("hidden");
  el.userBox.classList.remove("hidden");
  el.paymentCard.classList.remove("disabled-section");
  el.payBtn.disabled = false;
}

async function handleIncompletePayment(payment) {
  try {
    await api("/api/incomplete", { payment });
    addHistory({
      status: "success",
      asset: payment?.token?.code || payment?.asset || "Pi",
      amount: payment?.amount,
      paymentId: payment?.identifier,
      txid: payment?.transaction?.txid,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Incomplete payment handling failed:", error);
  }
}

async function login() {
  hideStatus();

  if (!window.Pi) {
    showStatus("Pi SDK غير متاح. افتح الموقع من داخل Pi Browser.", "error");
    return;
  }

  el.loginBtn.disabled = true;
  el.loginBtn.textContent = "جارٍ تسجيل الدخول...";

  try {
    const auth = await window.Pi.authenticate(
      ["username", "payments", "wallet_address"],
      handleIncompletePayment
    );

    setAuthenticated(auth.user, auth.accessToken);
    sessionStorage.setItem(
      "dealway_pi_auth",
      JSON.stringify({ user: auth.user, accessToken: auth.accessToken })
    );
    showStatus(`مرحبًا ${auth.user.username || "بك"}، تم تسجيل الدخول.`, "success");
  } catch (error) {
    console.error(error);
    showStatus(error?.message || "فشل تسجيل الدخول باستخدام Pi.", "error");
  } finally {
    el.loginBtn.disabled = false;
    el.loginBtn.textContent = "تسجيل الدخول باستخدام Pi";
  }
}

async function api(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(state.accessToken ? { Authorization: `Bearer ${state.accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || `Request failed (${response.status})`);
  }
  return result;
}

function validateAmount(raw) {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("اكتب كمية صحيحة أكبر من صفر.");
  }
  if (amount > 1000000) {
    throw new Error("الكمية كبيرة جدًا لهذا الاختبار.");
  }
  return amount;
}

async function pay() {
  if (!state.user || state.paying) return;

  let amount;
  try {
    amount = validateAmount(el.amount.value);
  } catch (error) {
    showStatus(error.message, "error");
    return;
  }

  const asset = selectedAsset();
  const memo = el.memo.value.trim() || "DealWay test payment";
  state.paying = true;
  el.payBtn.disabled = true;
  showStatus("جارٍ إنشاء عملية الدفع...");

  const paymentData = {
    amount,
    memo,
    metadata: {
      purpose: "dealway-payment-test",
      selectedAsset: asset,
      clientTime: new Date().toISOString(),
    },
    ...(asset === "DEALWAY" ? { tokenCanonical: DEALWAY_CANONICAL } : {}),
  };

  try {
    await window.Pi.createPayment(paymentData, {
      onReadyForServerApproval: async (paymentId) => {
        showStatus("جارٍ اعتماد عملية الدفع من الخادم...");
        await api("/api/approve", {
          paymentId,
          expectedAmount: amount,
          expectedAsset: asset,
        });
      },

      onReadyForServerCompletion: async (paymentId, txid) => {
        showStatus("جارٍ تأكيد المعاملة على الخادم...");
        const result = await api("/api/complete", {
          paymentId,
          txid,
          expectedAmount: amount,
          expectedAsset: asset,
        });

        addHistory({
          status: "success",
          asset: asset === "PI" ? "Test‑Pi" : "DEALWAY",
          amount,
          paymentId,
          txid,
          createdAt: new Date().toISOString(),
        });

        showStatus(result.message || "تم الدفع والتأكيد بنجاح.", "success");
        state.paying = false;
        el.payBtn.disabled = false;
      },

      onCancel: (paymentId) => {
        addHistory({
          status: "cancel",
          asset: asset === "PI" ? "Test‑Pi" : "DEALWAY",
          amount,
          paymentId,
          createdAt: new Date().toISOString(),
        });
        showStatus("تم إلغاء عملية الدفع.");
        state.paying = false;
        el.payBtn.disabled = false;
      },

      onError: (error, payment) => {
        console.error("Payment error:", error, payment);
        addHistory({
          status: "error",
          asset: asset === "PI" ? "Test‑Pi" : "DEALWAY",
          amount,
          paymentId: payment?.identifier,
          createdAt: new Date().toISOString(),
          message: error?.message,
        });
        showStatus(error?.message || "حدث خطأ أثناء الدفع.", "error");
        state.paying = false;
        el.payBtn.disabled = false;
      },
    });
  } catch (error) {
    console.error(error);
    showStatus(error?.message || "تعذر بدء عملية الدفع.", "error");
    state.paying = false;
    el.payBtn.disabled = false;
  }
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("dealway_payment_history") || "[]");
  } catch {
    return [];
  }
}

function addHistory(item) {
  const list = [item, ...getHistory()].slice(0, 20);
  localStorage.setItem("dealway_payment_history", JSON.stringify(list));
  renderHistory();
}

function renderHistory() {
  const list = getHistory();
  el.emptyHistory.classList.toggle("hidden", list.length > 0);
  el.clearHistory.classList.toggle("hidden", list.length === 0);

  const labels = {
    success: ["مكتملة", "state-success"],
    error: ["خطأ", "state-error"],
    cancel: ["ملغاة", "state-cancel"],
  };

  el.history.innerHTML = list.map((item) => {
    const [label, className] = labels[item.status] || ["غير معروف", ""];
    const date = new Date(item.createdAt).toLocaleString("ar");
    return `
      <article class="history-item">
        <div class="history-head">
          <strong>${escapeHtml(String(item.amount ?? "—"))} ${escapeHtml(item.asset || "")}</strong>
          <b class="${className}">${label}</b>
        </div>
        <small>${escapeHtml(date)}</small>
        ${item.paymentId ? `<small>Payment: ${escapeHtml(item.paymentId)}</small>` : ""}
        ${item.txid ? `<small>TX: ${escapeHtml(item.txid)}</small>` : ""}
      </article>
    `;
  }).join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

document.querySelectorAll('input[name="asset"]').forEach((input) => {
  input.addEventListener("change", updateAssetUI);
});
el.amount.addEventListener("input", updatePayLabel);
el.loginBtn.addEventListener("click", login);
el.payBtn.addEventListener("click", pay);
el.clearHistory.addEventListener("click", () => {
  localStorage.removeItem("dealway_payment_history");
  renderHistory();
});

try {
  const saved = JSON.parse(sessionStorage.getItem("dealway_pi_auth") || "null");
  if (saved?.user && saved?.accessToken) {
    setAuthenticated(saved.user, saved.accessToken);
  }
} catch {}

updateAssetUI();
renderHistory();
