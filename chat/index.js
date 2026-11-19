const API_URL = "http://localhost:8080";
const MAX_RECOMMENDATIONS = 8;

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
}

function normalizeText(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function detectCategory(message) {
    const text = normalizeText(message);
    const categories = [
        { category: "BOOKS", terms: ["livro", "livros", "book", "books", "romance", "leitura"] },
        { category: "TOYS", terms: ["brinquedo", "brinquedos", "toy", "toys"] },
        { category: "BAG", terms: ["bolsa", "bolsas", "bag"] },
        { category: "FASHION", terms: ["moda", "roupa", "roupas", "fashion"] },
        { category: "ELECTRONICS", terms: ["eletronico", "eletronicos", "eletronica", "eletronicas"] },
        { category: "HOME_APPLIANCES", terms: ["eletrodomestico", "eletrodomesticos"] },
        { category: "SPORTS", terms: ["esporte", "esportes", "sport"] },
        { category: "BEAUTY", terms: ["beleza", "beauty"] },
        { category: "PET_SUPPLIES", terms: ["pet", "pets", "animais"] },
        { category: "GROCERY", terms: ["mercado", "alimentos", "grocery"] },
        { category: "FURNITURE", terms: ["moveis", "furniture"] },
        { category: "AUTOMOTIVE", terms: ["automotivo", "automotivos", "carro", "carros"] },
        { category: "HEALTH", terms: ["saude", "health"] },
        { category: "OFFICE_SUPPLIES", terms: ["escritorio", "papelaria"] },
        { category: "MUSIC", terms: ["musica", "music"] },
        { category: "JEWELRY", terms: ["joias", "joia", "jewelry"] }
    ];

    return categories.find(({ terms }) => terms.some(term => text.includes(term)))?.category;
}

function detectMaximumPrice(message) {
    const text = normalizeText(message);
    const match = text.match(/(?:ate|no maximo|menos de|abaixo de|maximo)\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/);
    if (!match) return undefined;

    const price = Number(match[1].replace(",", "."));
    return Number.isFinite(price) ? price : undefined;
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

function appendRecommendations(products) {
    if (!Array.isArray(products) || products.length === 0) {
        appendMessage("bot", "Não encontrei produtos que atendam a esses filtros com estoque disponível. Tente outra categoria ou faixa de preço.");
        return;
    }

    appendMessage("bot", `Encontrei ${products.length} opção${products.length === 1 ? "" : "ões"} com base no seu histórico, na sua lista de desejos e nos produtos disponíveis:`);
    const recommendations = document.createElement("div");
    recommendations.className = "recommendations";
    recommendations.setAttribute("aria-label", "Produtos recomendados");
    products.forEach(product => recommendations.append(createRecommendationCard(product)));
    chatMessages.append(recommendations);
    recommendations.scrollIntoView({ behavior: "smooth", block: "end" });
}

async function fetchRecommendations(prompt = "") {
    const token = getToken();
    if (!token) {
        window.location.href = "/login.html";
        return;
    }

    const params = new URLSearchParams({ limit: String(MAX_RECOMMENDATIONS), typeCoin: "REAL" });
    const category = detectCategory(prompt);
    const maximumPrice = detectMaximumPrice(prompt);
    if (category) params.set("category", category);
    if (maximumPrice !== undefined) params.set("maximumPrice", String(maximumPrice));

    setApiStatus("Buscando recomendações...");
    try {
        const response = await fetch(`${API_URL}/customer/recommendations?${params}`, {
            headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
            redirectToLogin();
            return;
        }
        if (!response.ok) throw new Error(`A API respondeu com HTTP ${response.status}.`);

        appendRecommendations(await response.json());
        setApiStatus("Recomendações atualizadas");
    } catch (error) {
        console.error("Falha ao buscar recomendações:", error);
        appendMessage("bot", "Não consegui carregar recomendações agora. Confira se a loja está disponível e tente novamente.");
        setApiStatus("Falha ao conectar", true);
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
    appendMessage("user", text);
    appendMessage("bot", "Vou consultar as recomendações disponíveis para você.");
    await fetchRecommendations(text);
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

    fetchRecommendations();
});
