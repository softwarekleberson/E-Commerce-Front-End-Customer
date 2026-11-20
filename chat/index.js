const API_URL = "http://localhost:8080";
const MAX_RECOMMENDATIONS = 8;
let chatStarted = false;

const chatMessages = document.getElementById("chat-messages");
const messageForm = document.getElementById("message-composer");
const messageInput = document.getElementById("message");
const apiStatus = document.getElementById("api-status");

function getToken() {
    return localStorage.getItem("token");
}

function redirectToLogin() {
    localStorage.removeItem("token");
    window.location.href = "/login.html";
}

function setApiStatus(message, isError = false) {
    apiStatus.textContent = message;
    apiStatus.classList.toggle("status-error", isError);
}

function appendMessage(role, text) {
    const message = document.createElement("div");
    message.className = `message message--${role}`;
    if (role === "bot") {
        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.setAttribute("aria-hidden", "true");
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-book-open";
        avatar.append(icon);
        message.append(avatar);
    }

    const body = document.createElement("div");
    body.className = "message-body";
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    body.append(paragraph);
    message.append(body);
    chatMessages.append(message);
    message.scrollIntoView({ behavior: "smooth", block: "end" });
    return message;
}

function formatPrice(price, typeCoin) {
    const currencies = { REAL: "BRL", DOLAR: "USD", EURO: "EUR", LIBRA: "GBP" };
    const currency = currencies[typeCoin] || "BRL";
    try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(price));
    } catch {
        return `${typeCoin} ${Number(price).toFixed(2)}`;
    }
}

function createRecommendationCard(product) {
    const card = document.createElement("article");
    card.className = "book-card recommendation-card";

    const cover = document.createElement("div");
    cover.className = "book-cover book-cover--green";
    cover.textContent = product.category || "Produto";

    const info = document.createElement("div");
    info.className = "book-info";

    const tag = document.createElement("span");
    tag.className = "book-tag";
    tag.textContent = product.reason || "Recomendado para você";

    const name = document.createElement("h2");
    name.textContent = product.name || "Produto";

    const detail = document.createElement("p");
    detail.className = "book-author";
    detail.textContent = [product.brand, `${product.availableQuantity} em estoque`].filter(Boolean).join(" · ");

    const footer = document.createElement("div");
    footer.className = "book-footer";
    const price = document.createElement("strong");
    price.textContent = formatPrice(product.price, product.typeCoin);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.setAttribute("aria-label", `Adicionar ${product.name} ao carrinho`);
    addButton.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i>';
    addButton.addEventListener("click", () => addToCart(product, addButton));

    footer.append(price, addButton);
    info.append(tag, name, detail, footer);
    card.append(cover, info);
    return card;
}

function appendRecommendations(products, idle = false) {
    if (!Array.isArray(products) || products.length === 0) return;

    const recommendations = document.createElement("div");
    recommendations.className = idle ? "recommendations idle-recommendations" : "recommendations";
    recommendations.setAttribute("aria-label", "Produtos recomendados");
    products.slice(0, MAX_RECOMMENDATIONS).forEach(product => recommendations.append(createRecommendationCard(product)));
    chatMessages.append(recommendations);
    recommendations.scrollIntoView({ behavior: "smooth", block: "end" });
}

function clearIdleRecommendations() {
    chatMessages.querySelectorAll(".idle-recommendations, .idle-recommendation-message")
        .forEach(element => element.remove());
}

async function fetchInitialRecommendations() {
    const token = getToken();
    if (!token) return;

    const params = new URLSearchParams({ limit: String(MAX_RECOMMENDATIONS), typeCoin: "REAL" });
    try {
        const response = await fetch(`${API_URL}/customer/recommendations?${params}`, {
            headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
            redirectToLogin();
            return;
        }
        if (!response.ok) throw new Error(`A API respondeu com HTTP ${response.status}.`);

        const products = await response.json();
        if (chatStarted || !Array.isArray(products) || products.length === 0) return;
        const intro = appendMessage("bot", "Enquanto você decide o que procura, separei algumas sugestões para você:");
        intro.classList.add("idle-recommendation-message");
        appendRecommendations(products, true);
        setApiStatus("Sugestões pessoais carregadas");
    } catch (error) {
        console.error("Falha ao carregar sugestões iniciais:", error);
        if (!chatStarted) setApiStatus("Assistente pronto");
    }
}

async function addToCart(product, button) {
    const token = getToken();
    if (!token) {
        window.location.href = "/login.html";
        return;
    }

    button.disabled = true;
    try {
        const response = await fetch(`${API_URL}/customer/cart`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ productId: product.productId, quantity: 1 })
        });
        if (response.status === 401) {
            redirectToLogin();
            return;
        }
        if (!response.ok) throw new Error(`Não foi possível adicionar o produto (HTTP ${response.status}).`);

        button.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
        button.setAttribute("aria-label", `${product.name} adicionado ao carrinho`);
        appendMessage("bot", `${product.name} foi adicionado ao seu carrinho.`);
    } catch (error) {
        console.error("Falha ao adicionar produto ao carrinho:", error);
        appendMessage("bot", error.message || "Não consegui adicionar o produto ao carrinho.");
        button.disabled = false;
    }
}

async function sendPrompt(prompt) {
    const text = prompt.trim();
    if (!text) return;

    const token = getToken();
    if (!token) {
        window.location.href = "/login.html";
        return;
    }

    chatStarted = true;
    clearIdleRecommendations();
    appendMessage("user", text);
    const loadingMessage = appendMessage("bot", "Analisando sua mensagem...");
    setApiStatus("Consultando assistente...");

    try {
        const response = await fetch(`${API_URL}/customer/recommendations/chat`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ message: text })
        });
        if (response.status === 401) {
            redirectToLogin();
            return;
        }
        if (!response.ok) throw new Error(`A API respondeu com HTTP ${response.status}.`);

        const result = await response.json();
        loadingMessage.remove();
        appendMessage("bot", result.answer || "Não consegui responder agora.");
        appendRecommendations(result.recommendations);
        setApiStatus("Resposta pronta");
    } catch (error) {
        console.error("Falha na recomendação conversacional:", error);
        loadingMessage.remove();
        appendMessage("bot", "Não consegui consultar o assistente agora. Confira se a API e o serviço de IA estão disponíveis e tente novamente.");
        setApiStatus("Falha ao conectar", true);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const token = getToken();
    if (!token) {
        window.location.href = "/login.html";
        return;
    }

    messageForm.addEventListener("submit", async event => {
        event.preventDefault();
        const prompt = messageInput.value;
        messageInput.value = "";
        await sendPrompt(prompt);
    });

    document.querySelectorAll("[data-prompt]").forEach(button => {
        button.addEventListener("click", () => sendPrompt(button.dataset.prompt));
    });

    fetchInitialRecommendations();
});
