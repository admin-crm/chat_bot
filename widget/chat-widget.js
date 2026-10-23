
class UniversalChatbot extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.websiteId =
  this.getAttribute("data-website-id") ||
  "default";

    this.title =
      this.getAttribute("data-title") || "Universal Assistant";

    this.color =
      this.getAttribute("data-color") || "#2563eb";

    this.welcome =
      this.getAttribute("data-welcome") ||
      "Hi! I'm your AI assistant. How can I help you today?";

    this.logo = this.getAttribute("data-logo") || "";
    this.apiUrl =
      this.getAttribute("data-api") ||
      "http://localhost:5000/api/chat";
    this.busy = false;
  }

  connectedCallback() {
    this.render();
    this.addEventListeners();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          font-family: Inter, -apple-system, BlinkMacSystemFont,
            "Segoe UI", Arial, sans-serif;
          color: #172033;
          --chat-color: ${this.color};
          --chat-light: #eff6ff;
        }

        * { box-sizing: border-box; }

        button, input { font: inherit; }
        button { -webkit-tap-highlight-color: transparent; }

        .chat-launcher {
          position: fixed;
          right: 24px;
          bottom: 24px;
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 22px;
          background: var(--chat-color);
          color: white;
          font-size: 27px;
          cursor: pointer;
          box-shadow: 0 10px 30px #2563eb45;
          z-index: 999999;
          transition: transform .2s, border-radius .2s;
        }

        .chat-launcher:hover {
          transform: translateY(-3px);
          border-radius: 50%;
        }

        .chat-window {
          position: fixed;
          right: 24px;
          bottom: 100px;
          width: min(390px, calc(100vw - 32px));
          height: min(590px, calc(100dvh - 125px));
          min-height: 370px;
          display: none;
          flex-direction: column;
          overflow: hidden;
          background: #fff;
          border: 1px solid #e5eaf2;
          border-radius: 22px;
          box-shadow: 0 24px 80px #0f172a26;
          z-index: 999999;
          animation: appear .2s ease-out;
        }

        .chat-window.open { display: flex; }

        @keyframes appear {
          from { opacity: 0; transform: translateY(10px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .chat-header {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 17px;
          color: white;
          background: linear-gradient(135deg, var(--chat-color), #1d4ed8);
        }

        .brand-icon {
          width: 43px;
          height: 43px;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          border: 1px solid #ffffff50;
          border-radius: 15px;
          background: #ffffff20;
          overflow: hidden;
          font-size: 23px;
        }

        .brand-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .brand-copy { flex: 1; min-width: 0; }

        .brand-copy h2 {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          overflow-wrap: anywhere;
        }

        .status {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 5px;
          color: #e4edff;
          font-size: 11px;
        }

        .status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #86efac;
        }

        .header-actions { display: flex; gap: 5px; }

        .icon-button {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: white;
          font-size: 21px;
          cursor: pointer;
        }

.category-nav {
  display: flex;
  gap: 16px;
  padding: 11px 16px;
  overflow-x: auto;
  white-space: nowrap;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  scrollbar-width: none;
}

.category-nav::-webkit-scrollbar {
  display: none;
}

.category-link {
  flex-shrink: 0;
  padding: 3px 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #2563eb;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.category-link:hover,
.category-link:focus-visible {
  color: #1d4ed8;
  border-bottom-color: #2563eb;
  outline: none;
}


        .icon-button:hover { background: #ffffff20; }

        .welcome-panel {
          padding: 17px 16px 11px;
          background: #fff;
        }

        .welcome-title {
          margin: 0 0 5px;
          font-size: 17px;
          font-weight: 750;
          letter-spacing: -.3px;
        }

        .welcome-description {
          margin: 0;
          color: #718096;
          font-size: 12px;
          line-height: 1.5;
        }

        .quick-prompts {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 12px;
        }

        .quick-prompt {
          padding: 8px 10px;
          border: 1px solid #dbe6f5;
          border-radius: 12px;
          background: #f8fbff;
          color: #334155;
          font-size: 11px;
          text-align: left;
          cursor: pointer;
        }

        .quick-prompt:hover {
          border-color: var(--chat-color);
          color: var(--chat-color);
          background: var(--chat-light);
        }

        .messages {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 14px 16px 18px;
          overflow-y: auto;
          background: #f7f9fc;
          overscroll-behavior: contain;
          scroll-behavior: smooth;
        }

        .message-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }

        .message-row.user-row { justify-content: flex-end; }

        .mini-avatar {
          width: 27px;
          height: 27px;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          border: 1px solid #e1e8f2;
          border-radius: 10px;
          background: white;
          font-size: 14px;
        }

        .message {
          max-width: 84%;
          padding: 11px 13px;
          border-radius: 15px;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .bot {
          color: #263449;
          background: white;
          border: 1px solid #e5eaf2;
          border-bottom-left-radius: 5px;
        }

        .user {
          color: white;
          background: var(--chat-color);
          border-bottom-right-radius: 5px;
        }

        .typing {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 57px;
        }

        .typing span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #94a3b8;
          animation: bounce .9s infinite ease-in-out;
        }

        .typing span:nth-child(2) { animation-delay: .15s; }
        .typing span:nth-child(3) { animation-delay: .3s; }

        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }

        .chat-form {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 12px;
          border-top: 1px solid #e8edf4;
          background: white;
        }

        .input-wrap {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          padding: 0 12px;
          border: 1px solid #dce4ef;
          border-radius: 14px;
          background: #f8fafc;
          transition: border-color .2s, box-shadow .2s;
        }

        .input-wrap:focus-within {
          border-color: var(--chat-color);
          box-shadow: 0 0 0 3px #2563eb15;
        }

        .chat-input {
          width: 100%;
          min-width: 0;
          padding: 13px 0;
          border: 0;
          outline: none;
          background: transparent;
          color: #172033;
          font-size: 13px;
        }

        .chat-input::placeholder { color: #94a3b8; }

        .send-button {
          width: 45px;
          height: 45px;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 14px;
          background: var(--chat-color);
          color: white;
          font-size: 20px;
          cursor: pointer;
          transition: opacity .2s;
        }

        .send-button:disabled { opacity: .5; cursor: not-allowed; }

        .footer-note {
          padding: 0 10px 10px;
          background: white;
          color: #9aa5b5;
          font-size: 10px;
          text-align: center;
        }

        button:focus-visible {
          outline: 3px solid #93c5fd;
          outline-offset: 2px;
        }

        @media (max-width: 480px) {
          .chat-launcher {
            right: 16px;
            bottom: 16px;
            width: 56px;
            height: 56px;
            border-radius: 19px;
          }

          .chat-window {
            right: 8px;
            bottom: 82px;
            width: calc(100vw - 16px);
            height: min(650px, calc(100dvh - 100px));
            max-height: calc(100dvh - 100px);
            border-radius: 20px;
          }

          .chat-header { padding: 14px; }
          .welcome-panel { padding: 14px 13px 10px; }
          .messages { padding: 12px 13px; }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: .01ms !important;
            transition-duration: .01ms !important;
            scroll-behavior: auto !important;
          }
        }
      </style>

      <button class="chat-launcher" type="button"
        aria-label="Open chat" aria-expanded="false">✦</button>

      <section class="chat-window" role="dialog"
        aria-label="${this.escapeHTML(this.title)}">

        <header class="chat-header">
          <div class="brand-icon">
            ${this.logo
              ? `<img src="${this.escapeHTML(this.logo)}" alt="" />`
              : "✦"}
          </div>

          <div class="brand-copy">
            <h2>${this.escapeHTML(this.title)}</h2>
            <div class="status">
              <span class="status-dot"></span>
              AI assistant
            </div>
          </div>

          <div class="header-actions">
            <button class="icon-button new-chat-button"
              type="button" aria-label="Start a new chat"
              title="New chat">＋</button>
            <button class="icon-button close-button"
              type="button" aria-label="Close chat"
              title="Close">×</button>
          </div>
        </header>

        <nav class="category-nav" aria-label="Menu categories">
          <button class="category-link" type="button"
            data-category="Appetisers">Appetisers</button>
          <button class="category-link" type="button"
            data-category="Biriyanis">Biriyanis</button>
          <button class="category-link" type="button"
            data-category="Desserts">Desserts</button>
          <button class="category-link" type="button"
            data-category="Dosa">Dosa</button>
          <button class="category-link" type="button"
            data-category="Drinks">Drinks</button>
          <button class="category-link" type="button"
            data-category="More">More</button>
        </nav>

        <div class="welcome-panel">

          <p class="welcome-title">How can I help you?</p>
          <p class="welcome-description">
            Ask a question and I'll do my best to help.
          </p>
          <div class="quick-prompts">
            <button class="quick-prompt" type="button">
              What can you help me with?
            </button>
            <button class="quick-prompt" type="button">
              Tell me about this website
            </button>
          </div>
        </div>

        <div class="messages" role="log"
          aria-live="polite" aria-relevant="additions text"></div>

        <form class="chat-form">
          <div class="input-wrap">
            <input class="chat-input" type="text"
              placeholder="Ask me anything..."
              aria-label="Your message" maxlength="2000" required />
          </div>
          <button class="send-button" type="submit"
            aria-label="Send message" title="Send">↑</button>
        </form>
        <div class="footer-note">AI responses may need verification.</div>
      </section>
    `;

    this.addMessage(this.welcome, "bot");
  }

  addEventListeners() {
    const root = this.shadowRoot;
    const launcher = root.querySelector(".chat-launcher");
    const chatWindow = root.querySelector(".chat-window");
    const closeButton = root.querySelector(".close-button");
    const newChatButton = root.querySelector(".new-chat-button");
    const form = root.querySelector(".chat-form");
    const input = root.querySelector(".chat-input");
    const sendButton = root.querySelector(".send-button");

    launcher.addEventListener("click", () => {
      const isOpen = chatWindow.classList.toggle("open");
      launcher.setAttribute("aria-expanded", String(isOpen));

      if (isOpen) input.focus();
    });

    closeButton.addEventListener("click", () => {
      chatWindow.classList.remove("open");
      launcher.setAttribute("aria-expanded", "false");
      launcher.focus();
    });

    newChatButton.addEventListener("click", () => {
      if (this.busy) return;

      root.querySelector(".messages").replaceChildren();
      this.addMessage(this.welcome, "bot");
      input.value = "";
      input.focus();
    });


    root.querySelectorAll(".category-link").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.busy) return;

        const category = button.dataset.category;

        const prompts = {
          Appetisers: "Show me the available appetizers",
          Biriyanis: "Show me the available biriyani menu items",
          Desserts: "Show me the available desserts",
          Dosa: "Show me the available dosa items",
          Drinks: "Show me the available drinks",
          More: "Show me all available menu categories"
        };

        input.value = prompts[category] || category;
        form.requestSubmit();
      });
    });


    root.querySelectorAll(".quick-prompt").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.busy) return;
        input.value = button.textContent.trim();
        form.requestSubmit();
      });
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const message = input.value.trim();
      if (!message || this.busy) return;

      this.busy = true;
      this.addMessage(message, "user");
      input.value = "";
      input.disabled = true;
      sendButton.disabled = true;

      const loading = this.addTypingIndicator();

      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
  message,
  websiteId: this.websiteId
}),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error("Chat request failed");
        }

        loading.remove();
        this.addMessage(data.reply || "No response received.", "bot");
      } catch (error) {
        loading.remove();
        this.addMessage(
          "Sorry, I couldn't connect. Please try again.",
          "bot"
        );
        console.error("Chat API error:", error);
      } finally {
        this.busy = false;
        input.disabled = false;
        sendButton.disabled = false;
        input.focus();
      }
    });
  }

  addTypingIndicator() {
    const row = document.createElement("div");
    row.className = "message-row bot-row";

    const avatar = document.createElement("div");
    avatar.className = "mini-avatar";
    avatar.textContent = "✦";
    avatar.setAttribute("aria-hidden", "true");

    const bubble = document.createElement("div");
    bubble.className = "message bot typing";
    bubble.setAttribute("aria-label", "Assistant is typing");

    for (let i = 0; i < 3; i++) {
      bubble.appendChild(document.createElement("span"));
    }

    row.append(avatar, bubble);
    this.shadowRoot.querySelector(".messages").appendChild(row);
    this.scrollToBottom();

    return row;
  }

  addMessage(text, type) {
    const row = document.createElement("div");
    row.className = `message-row ${type}-row`;

    if (type === "bot") {
      const avatar = document.createElement("div");
      avatar.className = "mini-avatar";
      avatar.textContent = "✦";
      avatar.setAttribute("aria-hidden", "true");
      row.appendChild(avatar);
    }

    const message = document.createElement("div");
    message.className = `message ${type}`;
    message.textContent = String(text);
    row.appendChild(message);

    this.shadowRoot.querySelector(".messages").appendChild(row);
    this.scrollToBottom();

    return message;
  }

  scrollToBottom() {
    const messages = this.shadowRoot.querySelector(".messages");
    messages.scrollTop = messages.scrollHeight;
  }

  escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }
}


if (!customElements.get("universal-chatbot")) {
  customElements.define("universal-chatbot", UniversalChatbot);
}

// Automatically create the chatbot when this script is embedded.

(() => {
  const script = document.currentScript;

  if (!script) return;

  // Avoid adding a second chatbot if one already exists.
  if (document.querySelector("universal-chatbot")) return;

  const chatbot = document.createElement("div");

  chatbot.innerHTML = `
    <universal-chatbot
      data-website-id="${script.getAttribute("data-website-id") || "default"}"
      data-title="${script.getAttribute("data-title") || "Universal Assistant"}"
      data-color="${script.getAttribute("data-color") || "#2563eb"}"
      data-welcome="${script.getAttribute("data-welcome") || "Hi! I'm your AI assistant. How can I help you today?"}"
      data-api="${script.getAttribute("data-api") || "http://localhost:5000/api/chat"}">
    </universal-chatbot>
  `;

  document.body.appendChild(chatbot.firstElementChild);
})();
