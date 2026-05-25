// ── CONFIG & ESTADO GLOBAL ──────────────────────────────
const LS_KEY = "foundrizin_cfg";

// Credenciais padrão sintonizadas com o seu Agent do Azure AI Project
const ENV_ENDPOINT = "__AZURE_ENDPOINT__";
const ENV_KEY = "__AZURE_API_KEY__";

const savedCfg = JSON.parse(localStorage.getItem(LS_KEY) || "{}");

let cfg = {
  endpoint: savedCfg.endpoint || (ENV_ENDPOINT.startsWith("__") ? "" : ENV_ENDPOINT),
  model: savedCfg.model || "gpt-oss-120b",
  agentName: savedCfg.agentName || "foundrizin",
  agentVersion: savedCfg.agentVersion || "1",
  key: savedCfg.key || (ENV_KEY.startsWith("__") ? "" : ENV_KEY),
};

// Guarda o ID da conversa atual para manter o contexto na nuvem (Padrão do SDK)
let currentConversationId = null;

// Elementos do DOM mapeados
const $ = (id) => document.getElementById(id);
const messages = $("messages");
const input = $("input");
const sendBtn = $("send-btn");
const overlay = $("modal-overlay");

// ── MODAL DE CONFIGURAÇÃO ───────────────────────────────
function openModal() {
  $("cfg-endpoint").value = cfg.endpoint || "";
  $("cfg-agent-name").value = cfg.agentName || "foundrizin";
  $("cfg-agent-version").value = cfg.agentVersion || "1";
  $("cfg-key").value = cfg.key || "";
  overlay.classList.add("open");
}

function closeModal() {
  overlay.classList.remove("open");
}

$("btn-config").onclick = openModal;
$("modal-close").onclick = closeModal;
overlay.onclick = (e) => {
  if (e.target === overlay) closeModal();
};

$("btn-save").onclick = () => {
  cfg = {
    // Remove barras invertidas no final para não duplicar na concatenação das rotas
    endpoint: $("cfg-endpoint").value.trim().replace(/\/+$/, ""),
    agentName: $("cfg-agent-name").value.trim(),
    agentVersion: $("cfg-agent-version").value.trim(),
    key: $("cfg-key").value.trim(),
  };
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  currentConversationId = null; // Limpa a conversa antiga se mudar de configuração para gerar uma nova
  closeModal();
};

// ── PROCESSAMENTO VISUAL E RENDERIZAÇÃO ────────────────
function hideWelcome() {
  const w = $("welcome");
  if (w) w.remove();
}

function addMessage(role, text) {
  hideWelcome();
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${role}`;
  avatar.textContent = role === "bot" ? "F" : "Eu";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = formatText(text);

  row.appendChild(avatar);
  row.appendChild(bubble);
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

function addTyping() {
  hideWelcome();
  const row = document.createElement("div");
  row.className = "msg-row bot";
  row.id = "typing-row";

  const avatar = document.createElement("div");
  avatar.className = `avatar bot`;
  avatar.textContent = "F";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML =
    '<div class="typing-dots"><span></span><span></span><span></span></div>';

  row.appendChild(avatar);
  row.appendChild(bubble);
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
}

function removeTyping() {
  const t = $("typing-row");
  if (t) t.remove();
}

function formatText(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /`([^`]+)`/g,
      '<code style="background:var(--surface2);padding:1px 5px;border-radius:4px;font-size:13px">$1</code>',
    )
    .replace(/\n/g, "<br>");
}

// ── REQUISIÇÃO (INTEGRAÇÃO COM AZURE AGENT BASEADO NO SDK VIA HTTP REST) ──
async function callFoundry(userText) {
  if (!cfg.endpoint || !cfg.key) {
    addMessage(
      "bot",
      "⚠️ Configure o **Endpoint**, **Nome do Agente** e a **API Key** clicando em ⚙ Config, uai, aaa.",
    );
    return;
  }

  addTyping();
  sendBtn.disabled = true;

  try {
    const apiVersion = "2024-08-01-preview";
    const headers = {
      "Content-Type": "application/json",
      "api-key": cfg.key,
    };

    // PASSO 1: Garantir que temos uma conversa ativa (Simula: openAIClient.conversations.create)
    if (!currentConversationId) {
      const convUrl = `${cfg.endpoint}/conversations?api-version=${apiVersion}`;
      const convRes = await fetch(convUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          items: [{ type: "message", role: "user", content: userText }],
        }),
      });

      if (!convRes.ok) {
        const err = await convRes.json().catch(() => ({}));
        throw new Error(
          err?.error?.message || `Erro ao iniciar conversa (${convRes.status})`,
        );
      }

      const convData = await convRes.json();
      currentConversationId = convData.id; // Salvamos o ID retornado pela Azure para as próximas mensagens
    } else {
      // Se a conversa já existe, adicionamos a nova mensagem à rota de mensagens dela
      const msgUrl = `${cfg.endpoint}/conversations/${currentConversationId}/messages?api-version=${apiVersion}`;
      const msgRes = await fetch(msgUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          role: "user",
          content: userText,
        }),
      });

      if (!msgRes.ok) {
        const err = await msgRes.json().catch(() => ({}));
        throw new Error(
          err?.error?.message || `Erro ao anexar mensagem (${msgRes.status})`,
        );
      }
    }

    // PASSO 2: Solicitar a resposta do Agente (Simula: openAIClient.responses.create)
    const responseUrl = `${cfg.endpoint}/conversations/${currentConversationId}/responses?api-version=${apiVersion}`;
    const res = await fetch(responseUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        agent: {
          name: cfg.agentName,
          version: cfg.agentVersion,
          type: "agent_reference",
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        err?.error?.message || `Erro ao gerar resposta (${res.status})`,
      );
    }

    const data = await res.json();
    const reply = data?.output_text || "Não consegui obter uma resposta, aaa.";

    removeTyping();
    addMessage("bot", reply);
  } catch (err) {
    removeTyping();
    addMessage(
      "bot",
      `❌ Erro: **${err.message}**, aaa. Verifique as configurações em ⚙ Config.`,
    );
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

// ── EVENT LISTENERS (AÇÕES DE ENVIO) ────────────────────
function send() {
  const text = input.value.trim();
  if (!text) return;
  addMessage("user", text);
  input.value = "";
  input.style.height = "auto";
  callFoundry(text);
}

sendBtn.onclick = send;

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

// Auto-ajuste de altura da área de escrita
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
});

// Vinculado globalmente para os botões rápidos (Chips) funcionarem
window.sendChip = function (el) {
  input.value = el.textContent.trim();
  send();
};

// Ativação automática preventiva do painel de configuração caso falte dados
if (!cfg.endpoint || !cfg.key) {
  setTimeout(openModal, 800);
}
