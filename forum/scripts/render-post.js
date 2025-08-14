// Превращает \n и \n\n в <br> и абзацы (если body приходит обычным текстом)
function paragraphs(text) {
  const safe = (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");
  return safe
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Рендер одного поста из JSON (с поддержкой media)
function renderPost(post) {
  const article = document.createElement("article");
  article.className = "post kx-panel"; // добавил kx-panel для твоего оформления

  // Заголовок и мета
  const head = document.createElement("header");
  head.className = "post-head";

  const h2 = document.createElement("h2");
  h2.className = "post-title";
  h2.textContent = post.title || "(без названия)";

  const meta = document.createElement("div");
  meta.className = "post-meta";
  const dt = post.created ? new Date(post.created) : null;
  meta.textContent = `${post.board || ""} · ${post.sector || ""} · ${dt ? dt.toLocaleString() : ""}`;

  head.appendChild(h2);
  head.appendChild(meta);
  article.appendChild(head);

  // ====== ЭТО И ЕСТЬ ТВОЙ CONTAINER ДЛЯ ТЕКСТА ======
  const container = document.createElement("div");
  container.className = "post-body";
  // Если body — чистый текст:
  container.innerHTML = paragraphs(post.body);
  // Если у тебя уже доверенный HTML в body, используй:
  // container.innerHTML = post.body;
  article.appendChild(container);

  // ====== МЕДИА: картинки/аудио/видео из post.media ======
  if (Array.isArray(post.media) && post.media.length) {
    const mediaWrap = document.createElement("div");
    mediaWrap.className = "post-media";

    post.media.forEach(m => {
      if (m.type === "image" && m.src) {
        const figure = document.createElement("figure");
        const img = document.createElement("img");
        img.src = m.src;
        img.alt = m.alt || "";
        img.loading = "lazy";
        const cap = document.createElement("figcaption");
        cap.textContent = m.caption || "";
        figure.appendChild(img);
        if (m.caption) figure.appendChild(cap);
        mediaWrap.appendChild(figure);
      }
      // захочешь — добавь сюда поддержку audio/video/doc
    });

    article.appendChild(mediaWrap);
  }

  return article;
}

// Демонстрация: рендерим один пост в ленту #feed
// На странице должен быть контейнер ленты: <div id="feed"></div>
document.addEventListener("DOMContentLoaded", async () => {
  const feed = document.getElementById("feed");
  if (!feed) return;

  // Путь подстрой под свою структуру.
  // Если эта страница лежит в /forum/, то такой путь верный:
  const res = await fetch("content/threads/0049-rain-analysis.json");
  const post = await res.json();
  feed.appendChild(renderPost(post));
});
