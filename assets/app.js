"use strict";

(function () {
  var DEALWAY_CANONICAL =
    "DEALWAY:GBQ3H472BMOMTFRSK5P26FBRVOE3ZFCB5F3FTGXEGOV5CN7RAB6TRPJR";

  var state = {
    sdkReady: false,
    user: null,
    accessToken: null,
    paying: false
  };

  var dom = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function log(message, data) {
    var line = "[" + new Date().toLocaleTimeString() + "] " + message;
    if (data !== undefined) {
      try {
        line += "\n" + JSON.stringify(data, null, 2);
      } catch (_) {
        line += "\n" + String(data);
      }
    }
    console.log(message, data || "");
    dom.debugLog.textContent += "\n" + line;
  }

  function toast(message, type) {
    dom.toast.textContent = message;
    dom.toast.className = "toast" + (type ? " " + type : "");
  }

  function selectedAsset() {
    var checked = document.querySelector('input[name="asset"]:checked');
    return checked ? checked.value : "PI";
  }

  function updatePaymentUI() {
    var asset = selectedAsset();
    var labels = document.querySelectorAll(".asset");
    for (var i = 0; i < labels.length; i += 1) {
      var input = labels[i].querySelector("input");
      labels[i].classList.toggle("active", Boolean(input && input.checked));
    }

    dom.tokenBox.classList.toggle("hidden", asset !== "DEALWAY");
    dom.payText.textContent =
      "ادفع " + (dom.amount.value || "0") + " " +
      (asset === "PI" ? "Test‑Pi" : "DEALWAY");
  }

  function enableAuthenticatedUser(auth) {
    state.user = auth.user;
    state.accessToken = auth.accessToken;

    var name = auth.user && (auth.user.username || auth.user.uid)
      ? (auth.user.username || auth.user.uid)
      : "Pi User";

    dom.username.textContent = name;
    dom.avatar.textContent = name.charAt(0).toUpperCase();
    dom.walletAddress.textContent =
      auth.user && auth.user.wallet_address
        ? auth.user.wallet_address
        : "تم تسجيل الدخول بنجاح";

    dom.loginBtn.classList.add("hidden");
    dom.userCard.classList.remove("hidden");
    dom.paymentPanel.classList.remove("locked");
    dom.payBtn.disabled = false;

    try {
      sessionStorage.setItem("dealway_auth", JSON.stringify(auth));
    } catch (error) {
      log("Session storage unavailable", String(error));
    }
  }

  function loadPiSdk() {
    return new Promise(function (resolve, reject) {
      if (window.Pi && typeof window.Pi.init === "function") {
        resolve(window.Pi);
        return;
      }

      var script = document.createElement("script");
      script.src = "https://sdk.minepi.com/pi-sdk.js";
      script.async = true;
      script.onload = function () {
        if (window.Pi && typeof window.Pi.init === "function") {
          resolve(window.Pi);
        } else {
          reject(new Error("Pi SDK loaded but window.Pi is unavailable"));
        }
      };
      script.onerror = function () {
        reject(new Error("Failed to download Pi SDK"));
      };
      document.head.appendChild(script);
    });
  }

  async function initializePi() {
    dom.sdkState.textContent = "جارٍ تحميل Pi SDK…";
    dom.sdkState.className = "sdk-state loading";

    try {
      var Pi = await loadPiSdk();
      await Promise.resolve(Pi.init({ version: "2.0" }));

      state.sdkReady = true;
      dom.sdkState.textContent = "Pi SDK جاهز";
      dom.sdkState.className = "sdk-state ready";
      dom.loginBtn.disabled = false;
      dom.loginBtn.textContent = "تسجيل الدخول باستخدام Pi";
      log("Pi SDK initialized successfully");

      restoreAuth();
    } catch (error) {
      dom.sdkState.textContent = "تعذر تحميل Pi SDK";
      dom.sdkState.className = "sdk-state error";
      dom.loginBtn.disabled = true;
      dom.loginBtn.textContent = "افتح الموقع داخل Pi Browser";
      toast(
        "تعذر تحميل Pi SDK. تأكد أن الرابط مفتوح داخل Pi Browser وأن الدومين مضاف في Developer Portal.",
        "error"
      );
      log("Pi SDK initialization failed", {
        message: error && error.message ? error.message : String(error),
        userAgent: navigator.userAgent,
        href: location.href
      });
    }
  }

  function restoreAuth() {
    try {
      var raw = sessionStorage.getItem("dealway_auth");
      if (!raw) return;
      var auth = JSON.parse(raw);
      if (auth && auth.user && auth.accessToken) {
        enableAuthenticatedUser(auth);
        log("Authentication restored from sessionStorage");
      }
    } catch (error) {
      log("Could not restore authentication", String(error));
    }
  }

  async function handleIncompletePayment(payment) {
    log("Incomplete payment found", payment);
    try {
      await callApi("/api/incomplete", { payment: payment });
      addHistory({
        status: "success",
        asset: "Recovered",
        amount: payment && payment.amount,
        paymentId: payment && payment.identifier,
        txid: payment && payment.transaction && payment.transaction.txid,
        date: new Date().toISOString()
      });
      toast("تمت معالجة عملية دفع غير مكتملة.", "success");
    } catch (error) {
      log("Incomplete payment recovery failed", String(error));
      toast(error.message || "فشل إكمال العملية السابقة.", "error");
    }
  }

  async function login() {
    if (!state.sdkReady || !window.Pi) {
      toast("Pi SDK غير جاهز.", "error");
      return;
    }

    dom.loginBtn.disabled = true;
    dom.loginBtn.textContent = "جارٍ تسجيل الدخول…";

    try {
      var auth = await window.Pi.authenticate(
        ["username", "payments", "wallet_address"],
        handleIncompletePayment
      );

      log("Authentication successful", {
        username: auth && auth.user && auth.user.username,
        uid: auth && auth.user && auth.user.uid
      });

      enableAuthenticatedUser(auth);
      toast("تم تسجيل الدخول بنجاح.", "success");
    } catch (error) {
      log("Authentication failed", {
        message: error && error.message ? error.message : String(error)
      });
      toast(
        error && error.message ? error.message : "فشل تسجيل الدخول.",
        "error"
      );
    } finally {
      if (!state.user) {
        dom.loginBtn.disabled = false;
        dom.loginBtn.textContent = "تسجيل الدخول باستخدام Pi";
      }
    }
  }

  async function callApi(url, body) {
    var headers = { "Content-Type": "application/json" };
    if (state.accessToken) {
      headers.Authorization = "Bearer " + state.accessToken;
    }

    var response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });

    var result;
    try {
      result = await response.json();
    } catch (_) {
      result = {};
    }

    if (!response.ok) {
      throw new Error(
        result.message || result.error || "Server error " + response.status
      );
    }

    return result;
  }

  function validateAmount() {
    var amount = Number(dom.amount.value);
    if (!isFinite(amount) || amount <= 0) {
      throw new Error("اكتب كمية صحيحة أكبر من صفر.");
    }
    if (amount > 1000000) {
      throw new Error("الكمية كبيرة جدًا للاختبار.");
    }
    return amount;
  }

  async function startPayment() {
    if (!state.user) {
      toast("سجّل الدخول أولًا.", "error");
      return;
    }
    if (state.paying) return;

    var amount;
    try {
      amount = validateAmount();
    } catch (error) {
      toast(error.message, "error");
      return;
    }

    var asset = selectedAsset();
    var memo = dom.memo.value.trim() || "DealWay test payment";

    var paymentData = {
      amount: amount,
      memo: memo,
      metadata: {
        purpose: "dealway-payment-test",
        selectedAsset: asset,
        createdAt: new Date().toISOString()
      }
    };

    if (asset === "DEALWAY") {
      paymentData.tokenCanonical = DEALWAY_CANONICAL;
    }

    state.paying = true;
    dom.payBtn.disabled = true;
    toast("جارٍ إنشاء عملية الدفع…");
    log("Creating payment", paymentData);

    try {
      await window.Pi.createPayment(paymentData, {
        onReadyForServerApproval: async function (paymentId) {
          log("Ready for approval", { paymentId: paymentId });
          toast("جارٍ اعتماد الدفع من الخادم…");

          await callApi("/api/approve", {
            paymentId: paymentId,
            expectedAmount: amount,
            expectedAsset: asset
          });

          log("Payment approved by server", { paymentId: paymentId });
        },

        onReadyForServerCompletion: async function (paymentId, txid) {
          log("Ready for completion", {
            paymentId: paymentId,
            txid: txid
          });
          toast("جارٍ تأكيد المعاملة…");

          var result = await callApi("/api/complete", {
            paymentId: paymentId,
            txid: txid,
            expectedAmount: amount,
            expectedAsset: asset
          });

          addHistory({
            status: "success",
            asset: asset === "PI" ? "Test‑Pi" : "DEALWAY",
            amount: amount,
            paymentId: paymentId,
            txid: txid,
            date: new Date().toISOString()
          });

          log("Payment completed", result);
          toast("تم الدفع والتأكيد بنجاح.", "success");
          state.paying = false;
          dom.payBtn.disabled = false;
        },

        onCancel: function (paymentId) {
          log("Payment cancelled", { paymentId: paymentId });
          addHistory({
            status: "cancel",
            asset: asset === "PI" ? "Test‑Pi" : "DEALWAY",
            amount: amount,
            paymentId: paymentId,
            date: new Date().toISOString()
          });
          toast("تم إلغاء عملية الدفع.");
          state.paying = false;
          dom.payBtn.disabled = false;
        },

        onError: function (error, payment) {
          log("Payment callback error", {
            message: error && error.message ? error.message : String(error),
            payment: payment
          });
          addHistory({
            status: "error",
            asset: asset === "PI" ? "Test‑Pi" : "DEALWAY",
            amount: amount,
            paymentId: payment && payment.identifier,
            date: new Date().toISOString()
          });
          toast(
            error && error.message ? error.message : "حدث خطأ أثناء الدفع.",
            "error"
          );
          state.paying = false;
          dom.payBtn.disabled = false;
        }
      });
    } catch (error) {
      log("createPayment failed", {
        message: error && error.message ? error.message : String(error)
      });
      toast(
        error && error.message ? error.message : "تعذر بدء الدفع.",
        "error"
      );
      state.paying = false;
      dom.payBtn.disabled = false;
    }
  }

  function readHistory() {
    try {
      return JSON.parse(localStorage.getItem("dealway_history") || "[]");
    } catch (_) {
      return [];
    }
  }

  function addHistory(item) {
    var list = readHistory();
    list.unshift(item);
    list = list.slice(0, 20);
    try {
      localStorage.setItem("dealway_history", JSON.stringify(list));
    } catch (error) {
      log("Could not save history", String(error));
    }
    renderHistory();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];
    });
  }

  function renderHistory() {
    var list = readHistory();
    dom.emptyHistory.classList.toggle("hidden", list.length > 0);
    dom.clearBtn.classList.toggle("hidden", list.length === 0);

    dom.history.innerHTML = list.map(function (item) {
      var statusText = "غير معروف";
      var statusClass = "";

      if (item.status === "success") {
        statusText = "مكتملة";
        statusClass = "ok";
      } else if (item.status === "error") {
        statusText = "خطأ";
        statusClass = "bad";
      } else if (item.status === "cancel") {
        statusText = "ملغاة";
        statusClass = "cancel";
      }

      return (
        '<article class="history-item">' +
          '<div class="history-top">' +
            "<strong>" + escapeHtml(item.amount || "—") + " " +
              escapeHtml(item.asset || "") + "</strong>" +
            '<b class="' + statusClass + '">' + statusText + "</b>" +
          "</div>" +
          "<small>" + escapeHtml(new Date(item.date).toLocaleString("ar")) + "</small>" +
          (item.paymentId
            ? "<small>Payment: " + escapeHtml(item.paymentId) + "</small>"
            : "") +
          (item.txid
            ? "<small>TX: " + escapeHtml(item.txid) + "</small>"
            : "") +
        "</article>"
      );
    }).join("");
  }

  function bindEvents() {
    dom.loginBtn.addEventListener("click", login);
    dom.payBtn.addEventListener("click", startPayment);
    dom.amount.addEventListener("input", updatePaymentUI);

    var radios = document.querySelectorAll('input[name="asset"]');
    for (var i = 0; i < radios.length; i += 1) {
      radios[i].addEventListener("change", updatePaymentUI);
    }

    dom.clearBtn.addEventListener("click", function () {
      localStorage.removeItem("dealway_history");
      renderHistory();
    });

    window.addEventListener("error", function (event) {
      log("Window error", {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno
      });
    });

    window.addEventListener("unhandledrejection", function (event) {
      log("Unhandled promise rejection", {
        reason: event.reason && event.reason.message
          ? event.reason.message
          : String(event.reason)
      });
    });
  }

  function boot() {
    dom.loginBtn = byId("loginBtn");
    dom.userCard = byId("userCard");
    dom.username = byId("username");
    dom.walletAddress = byId("walletAddress");
    dom.avatar = byId("avatar");
    dom.paymentPanel = byId("paymentPanel");
    dom.payBtn = byId("payBtn");
    dom.payText = byId("payText");
    dom.amount = byId("amount");
    dom.memo = byId("memo");
    dom.tokenBox = byId("tokenBox");
    dom.history = byId("history");
    dom.emptyHistory = byId("emptyHistory");
    dom.clearBtn = byId("clearBtn");
    dom.toast = byId("toast");
    dom.sdkState = byId("sdkState");
    dom.debugLog = byId("debugLog");

    bindEvents();
    updatePaymentUI();
    renderHistory();
    log("Application booted", {
      userAgent: navigator.userAgent,
      href: location.href
    });
    initializePi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
