(() => {
  "use strict";

  const CONFIG = Object.freeze({
    piSandbox: false,
    piScopes: ["username", "payments"],
    maxImageBytes: 5 * 1024 * 1024
  });

  if (window.Pi) {
    window.Pi.init({ version: "2.0", sandbox: false });
  }

  const Api = (() => {
    const tokenKey = "meshora_session";
    const getToken = () => localStorage.getItem(tokenKey);
    const setToken = token => localStorage.setItem(tokenKey, token);
    const clearToken = () => localStorage.removeItem(tokenKey);

    async function request(path, options = {}) {
      const headers = new Headers(options.headers || {});
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (options.body && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(path, { ...options, headers });
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (response.status === 401) {
        clearToken();
        if (location.pathname !== "/" && !location.pathname.endsWith("index.html")) {
          location.href = "/";
        }
      }

      if (!response.ok) throw new Error(data?.error || data || "حدث خطأ غير متوقع");
      return data;
    }

    return { request, getToken, setToken, clearToken };
  })();

  window.Api = Api;

  const page = document.body.dataset.page;

  document.addEventListener("DOMContentLoaded", () => {
    if (page === "login") initLogin();
    if (page === "feed") initFeed();
    if (page === "profile") initProfile();
    if (page === "promote") initPromote();
  });

  function setStatus(element, message, type = "") {
    if (!element) return;
    element.textContent = message;
    element.className = `status-text${type ? ` ${type}` : ""}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
  }

  async function initLogin() {
    const button = document.getElementById("loginButton");
    const status = document.getElementById("loginStatus");
    if (Api.getToken()) return location.href = "/app";

    button.addEventListener("click", async () => {
      if (!window.Pi) return setStatus(status, "افتح الموقع داخل Pi Browser وتحقق من الاتصال.", "error");
      button.disabled = true;
      setStatus(status, "جاري الاتصال بحسابك…");

      try {
        const auth = await Pi.authenticate(CONFIG.piScopes, recoverIncompletePayment);
        const result = await Api.request("/api/auth", {
          method: "POST",
          body: JSON.stringify({ accessToken: auth.accessToken })
        });
        Api.setToken(result.token);
        setStatus(status, `مرحبًا ${result.user.username}`, "success");
        location.href = "/app";
      } catch (error) {
        setStatus(status, error.message, "error");
      } finally {
        button.disabled = false;
      }
    });
  }

  async function recoverIncompletePayment(payment) {
    try {
      await Api.request("/api/payments-recover", {
        method: "POST",
        body: JSON.stringify({
          paymentId: payment.identifier,
          txid: payment.transaction?.txid || null
        })
      });
    } catch (error) {
      console.error("Payment recovery failed", error);
    }
  }

  async function initFeed() {
    if (!Api.getToken()) return location.href = "/";

    const feedList = document.getElementById("feedList");
    const feedStatus = document.getElementById("feedStatus");
    const contentInput = document.getElementById("postContent");
    const imageInput = document.getElementById("postImage");
    const imageName = document.getElementById("imageName");
    const publishButton = document.getElementById("publishButton");
    const composerStatus = document.getElementById("composerStatus");

    document.getElementById("logoutButton")?.addEventListener("click", () => {
      Api.clearToken();
      location.href = "/";
    });
    document.getElementById("refreshButton")?.addEventListener("click", loadFeed);
    imageInput?.addEventListener("change", () => {
      imageName.textContent = imageInput.files[0]?.name || "";
    });
    publishButton?.addEventListener("click", createPost);

    await Promise.all([loadMe(), loadFeed()]);

    async function loadMe() {
      const { user } = await Api.request("/api/me");
      const letter = (user.display_name || user.username || "M").slice(0, 1).toUpperCase();
      document.getElementById("topAvatar").textContent = letter;
      document.getElementById("composerAvatar").textContent = letter;
    }

    async function createPost() {
      const content = contentInput.value.trim();
      const file = imageInput.files[0];
      if (!content && !file) return setStatus(composerStatus, "اكتب نصًا أو اختر صورة.", "error");
      if (file && file.size > CONFIG.maxImageBytes) return setStatus(composerStatus, "الصورة أكبر من 5MB.", "error");

      publishButton.disabled = true;
      setStatus(composerStatus, "جاري النشر…");
      try {
        const mediaUrl = file ? await uploadImage(file) : null;
        await Api.request("/api/posts", {
          method: "POST",
          body: JSON.stringify({ content, mediaUrl })
        });
        contentInput.value = "";
        imageInput.value = "";
        imageName.textContent = "";
        setStatus(composerStatus, "تم النشر.", "success");
        await loadFeed();
      } catch (error) {
        setStatus(composerStatus, error.message, "error");
      } finally {
        publishButton.disabled = false;
      }
    }

    async function uploadImage(file) {
      const signed = await Api.request("/api/uploads", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size })
      });
      const response = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });
      if (!response.ok) throw new Error("فشل رفع الصورة.");
      return signed.publicUrl;
    }

    async function loadFeed() {
      feedStatus.classList.remove("hidden");
      setStatus(feedStatus, "جاري تحميل المنشورات…");
      try {
        const { posts } = await Api.request("/api/feed");
        feedList.replaceChildren(...posts.map(renderPost));
        feedStatus.classList.toggle("hidden", posts.length > 0);
        if (!posts.length) setStatus(feedStatus, "لا توجد منشورات بعد.");
      } catch (error) {
        setStatus(feedStatus, error.message, "error");
      }
    }

    function renderPost(post) {
      const article = document.createElement("article");
      article.className = "post-card card";

      const header = document.createElement("div");
      header.className = "post-header";
      const avatar = document.createElement("span");
      avatar.className = "avatar";
      avatar.textContent = (post.author.display_name || post.author.username || "M").slice(0, 1).toUpperCase();
      const meta = document.createElement("div");
      meta.className = "post-meta";
      const author = document.createElement("div");
      author.className = "post-author";
      author.textContent = post.author.display_name || post.author.username;
      const time = document.createElement("div");
      time.className = "post-time";
      time.textContent = new Intl.DateTimeFormat("ar-EG", {
        dateStyle: "medium", timeStyle: "short"
      }).format(new Date(post.created_at));
      meta.append(author, time);
      header.append(avatar, meta);

      if (post.sponsored) {
        const badge = document.createElement("span");
        badge.className = "sponsored-badge";
        badge.textContent = "مموّل";
        header.append(badge);
      }
      article.append(header);

      if (post.content) {
        const body = document.createElement("div");
        body.className = "post-content";
        body.textContent = post.content;
        article.append(body);
      }

      if (post.media_url) {
        const image = document.createElement("img");
        image.className = "post-image";
        image.src = post.media_url;
        image.alt = "صورة مرفقة بالمنشور";
        image.loading = "lazy";
        article.append(image);
      }

      const stats = document.createElement("div");
      stats.className = "post-stats";
      stats.innerHTML = `<span>${post.likes_count} إعجاب</span><span>${post.comments_count} تعليق</span>`;
      article.append(stats);

      const actions = document.createElement("div");
      actions.className = "post-actions";
      const like = createAction(post.viewer_liked ? "♥ أعجبني" : "♡ إعجاب");
      like.classList.toggle("liked", post.viewer_liked);
      const comment = createAction("◌ تعليق");
      const promote = document.createElement("a");
      promote.className = "post-action";
      promote.textContent = "⚡ ترويج";
      promote.href = `/promote?post=${encodeURIComponent(post.id)}`;
      actions.append(like, comment, promote);
      article.append(actions);

      const area = document.createElement("div");
      area.className = "comment-area hidden";
      const list = document.createElement("div");
      list.className = "comment-list";
      const form = document.createElement("div");
      form.className = "comment-form";
      const input = document.createElement("input");
      input.maxLength = 500;
      input.placeholder = "اكتب تعليقًا…";
      const submit = document.createElement("button");
      submit.type = "button";
      submit.className = "primary-button";
      submit.textContent = "إرسال";
      form.append(input, submit);
      area.append(list, form);
      article.append(area);

      like.addEventListener("click", async () => {
        like.disabled = true;
        try {
          const result = await Api.request(`/api/post-actions?action=like&postId=${encodeURIComponent(post.id)}`, { method: "POST" });
          like.textContent = result.liked ? "♥ أعجبني" : "♡ إعجاب";
          like.classList.toggle("liked", result.liked);
          stats.firstChild.textContent = `${result.likesCount} إعجاب`;
        } catch (error) {
          alert(error.message);
        } finally {
          like.disabled = false;
        }
      });

      comment.addEventListener("click", async () => {
        area.classList.toggle("hidden");
        if (!area.classList.contains("hidden")) await loadComments(post.id, list);
      });

      submit.addEventListener("click", async () => {
        const text = input.value.trim();
        if (!text) return;
        submit.disabled = true;
        try {
          await Api.request(`/api/post-actions?action=comments&postId=${encodeURIComponent(post.id)}`, {
            method: "POST",
            body: JSON.stringify({ content: text })
          });
          input.value = "";
          post.comments_count += 1;
          stats.lastChild.textContent = `${post.comments_count} تعليق`;
          await loadComments(post.id, list);
        } catch (error) {
          alert(error.message);
        } finally {
          submit.disabled = false;
        }
      });

      if (post.sponsored && post.promotion_id) {
        queueMicrotask(() => Api.request("/api/promotions?action=impression", {
          method: "POST",
          body: JSON.stringify({ promotionId: post.promotion_id })
        }).catch(() => {}));
      }

      return article;
    }

    async function loadComments(postId, target) {
      const { comments } = await Api.request(`/api/post-actions?action=comments&postId=${encodeURIComponent(postId)}`);
      target.replaceChildren(...comments.map(item => {
        const div = document.createElement("div");
        div.className = "comment";
        const strong = document.createElement("strong");
        strong.textContent = item.author.display_name || item.author.username;
        const text = document.createElement("span");
        text.textContent = ` ${item.content}`;
        div.append(strong, text);
        return div;
      }));
    }

    function createAction(text) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "post-action";
      button.textContent = text;
      return button;
    }
  }

  async function initProfile() {
    if (!Api.getToken()) return location.href = "/";

    const editPanel = document.getElementById("editPanel");
    const status = document.getElementById("profileStatus");
    let me;

    document.getElementById("editProfileButton").addEventListener("click", () => editPanel.classList.toggle("hidden"));
    document.getElementById("saveProfileButton").addEventListener("click", save);

    try {
      const data = await Api.request("/api/me");
      me = data.user;
      render();
      const { posts } = await Api.request(`/api/posts?userId=${encodeURIComponent(me.id)}`);
      renderPosts(posts);
    } catch (error) {
      setStatus(status, error.message, "error");
    }

    function render() {
      document.getElementById("profileAvatar").textContent = (me.display_name || me.username).slice(0, 1).toUpperCase();
      document.getElementById("profileName").textContent = me.display_name || me.username;
      document.getElementById("profileUsername").textContent = `@${me.username}`;
      document.getElementById("profileBio").textContent = me.bio || "لم تتم إضافة نبذة بعد.";
      document.getElementById("displayNameInput").value = me.display_name || "";
      document.getElementById("bioInput").value = me.bio || "";
    }

    async function save() {
      const button = document.getElementById("saveProfileButton");
      button.disabled = true;
      try {
        const data = await Api.request("/api/me", {
          method: "PATCH",
          body: JSON.stringify({
            displayName: document.getElementById("displayNameInput").value.trim(),
            bio: document.getElementById("bioInput").value.trim()
          })
        });
        me = data.user;
        render();
        setStatus(status, "تم حفظ التغييرات.", "success");
      } catch (error) {
        setStatus(status, error.message, "error");
      } finally {
        button.disabled = false;
      }
    }

    function renderPosts(posts) {
      const list = document.getElementById("profilePosts");
      list.replaceChildren(...posts.map(post => {
        const article = document.createElement("article");
        article.className = "card";
        const content = document.createElement("div");
        content.className = "post-content";
        content.textContent = post.content || "";
        article.append(content);
        if (post.media_url) {
          const img = document.createElement("img");
          img.className = "post-image";
          img.src = post.media_url;
          img.alt = "صورة المنشور";
          article.append(img);
        }
        return article;
      }));
    }
  }

  async function initPromote() {
    if (!Api.getToken()) return location.href = "/";

    const postSelect = document.getElementById("postSelect");
    const packagesList = document.getElementById("packagesList");
    const payButton = document.getElementById("payButton");
    const status = document.getElementById("paymentStatus");
    let selectedPackage = null;

    payButton.addEventListener("click", startPayment);

    try {
      const [postsData, packageData, campaignData] = await Promise.all([
        Api.request("/api/posts?mine=true"),
        Api.request("/api/promotions?action=packages"),
        Api.request("/api/promotions?action=list")
      ]);

      postSelect.innerHTML = '<option value="">اختر منشورًا</option>';
      postsData.posts.forEach(post => {
        const option = document.createElement("option");
        option.value = post.id;
        option.textContent = (post.content || "منشور بصورة").slice(0, 70);
        postSelect.append(option);
      });

      const requested = new URLSearchParams(location.search).get("post");
      if (requested) postSelect.value = requested;

      packagesList.replaceChildren(...packageData.packages.map(pkg => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "package-card";
        card.innerHTML = `<strong>${escapeHtml(pkg.name)}</strong><div class="package-price">${pkg.amount_pi} π</div><span>${Number(pkg.target_impressions).toLocaleString("ar-EG")} ظهور مستهدف</span>`;
        card.addEventListener("click", () => {
          selectedPackage = pkg;
          [...packagesList.children].forEach(item => item.classList.remove("selected"));
          card.classList.add("selected");
          payButton.disabled = false;
        });
        return card;
      }));

      renderCampaigns(campaignData.campaigns);
    } catch (error) {
      setStatus(status, error.message, "error");
    }

    async function startPayment() {
      const postId = postSelect.value;
      if (!postId || !selectedPackage) return setStatus(status, "اختر منشورًا وباقة.", "error");
      if (!window.Pi) return setStatus(status, "افتح الصفحة داخل Pi Browser.", "error");

      payButton.disabled = true;
      setStatus(status, "جاري بدء الدفع…");

      Pi.createPayment({
        amount: Number(selectedPackage.amount_pi),
        memo: `ترويج منشور - ${selectedPackage.name}`,
        metadata: { purpose: "post_promotion", postId, packageId: selectedPackage.id }
      }, {
        onReadyForServerApproval: async paymentId => {
          setStatus(status, "جاري اعتماد الدفع…");
          await Api.request("/api/payments-approve", {
            method: "POST",
            body: JSON.stringify({ paymentId, postId, packageId: selectedPackage.id })
          });
        },
        onReadyForServerCompletion: async (paymentId, txid) => {
          setStatus(status, "جاري التحقق النهائي…");
          await Api.request("/api/payments-complete", {
            method: "POST",
            body: JSON.stringify({ paymentId, txid })
          });
          setStatus(status, "تم الدفع وتفعيل الحملة.", "success");
          payButton.disabled = false;
          const data = await Api.request("/api/promotions?action=list");
          renderCampaigns(data.campaigns);
        },
        onCancel: () => {
          setStatus(status, "تم إلغاء الدفع.");
          payButton.disabled = false;
        },
        onError: error => {
          setStatus(status, error?.message || "حدث خطأ أثناء الدفع.", "error");
          payButton.disabled = false;
        }
      });
    }

    function renderCampaigns(campaigns) {
      const list = document.getElementById("campaignsList");
      if (!campaigns.length) {
        list.textContent = "لا توجد حملات حتى الآن.";
        return;
      }
      list.replaceChildren(...campaigns.map(campaign => {
        const percent = Math.min(100, Math.round((campaign.delivered_impressions / campaign.target_impressions) * 100));
        const div = document.createElement("div");
        div.className = "campaign";
        div.innerHTML = `<strong>${escapeHtml(campaign.package_name)}</strong><div class="muted-text">${campaign.delivered_impressions} من ${campaign.target_impressions} ظهور — ${escapeHtml(campaign.status)}</div><div class="progress"><span style="width:${percent}%"></span></div>`;
        return div;
      }));
    }
  }
})();
