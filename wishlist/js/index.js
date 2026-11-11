const API_URL = "http://localhost:8080";

document.addEventListener("DOMContentLoaded", loadWishlist);

async function loadWishlist() {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "/login.html";
        return;
    }

    setWishlistStatus("Loading your wishlist...");

    try {
        const response = await fetch(`${API_URL}/customer/wishlist`, {
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("token");
            window.location.href = "/login.html";
            return;
        }
        if (!response.ok) {
            throw new Error(`Could not load wishlist (HTTP ${response.status}).`);
        }

        const wishlistItems = await response.json();
        if (!Array.isArray(wishlistItems)) {
            throw new Error("The wishlist response has an invalid format.");
        }

        if (wishlistItems.length === 0) {
            setWishlistStatus("Your wishlist is empty. Products you remove from the cart will be saved here.");
            return;
        }

        const products = await Promise.all(wishlistItems.map(loadWishlistProduct));
        renderWishlist(products);
        setWishlistStatus("");
    } catch (error) {
        console.error("Error loading wishlist:", error);
        setWishlistStatus(error.message || "Could not load your wishlist. Please try again.", true);
    }
}

async function loadWishlistProduct(item) {
    if (!item || typeof item.productId !== "string" || !item.productId) {
        return { productId: "", error: "This wishlist entry has no product ID." };
    }

    try {
        const response = await fetch(`${API_URL}/public/product/${encodeURIComponent(item.productId)}`);
        if (!response.ok) {
            throw new Error(`Product could not be loaded (HTTP ${response.status}).`);
        }

        return { productId: item.productId, product: await response.json() };
    } catch (error) {
        console.error(`Error loading wishlist product ${item.productId}:`, error);
        return { productId: item.productId, error: "Product details are currently unavailable." };
    }
}

function renderWishlist(items) {
    const container = document.getElementById("wishlist-items");
    container.replaceChildren();

    items.forEach((item) => {
        const card = document.createElement("article");
        card.className = "wishlist-card";
        card.dataset.productId = item.productId;

        if (item.product) {
            const image = document.createElement("img");
            image.src = item.product.midias?.[0]?.url || "https://via.placeholder.com/500x500?text=No+Image";
            image.alt = item.product.name || "Saved product";
            image.loading = "lazy";
            card.append(image);
        }

        const content = document.createElement("div");
        content.className = "wishlist-card-content";

        const title = document.createElement("h2");
        title.textContent = item.product?.name || "Saved product";
        content.append(title);

        if (item.product) {
            const price = document.createElement("p");
            const currency = item.product.typeCoin === "REAL" || item.product.typeCoin === "BRL" ? "R$" : "$";
            price.className = "wishlist-price";
            price.textContent = `${currency} ${Number(item.product.price).toFixed(2)}`;
            content.append(price);
        }

        if (item.error) {
            const error = document.createElement("p");
            error.className = "wishlist-product-error";
            error.textContent = item.error;
            content.append(error);
        }

        const actions = document.createElement("div");
        actions.className = "wishlist-actions";

        if (item.product) {
            const addButton = document.createElement("button");
            addButton.type = "button";
            addButton.className = "add-to-cart";
            addButton.textContent = "Add to Cart";
            addButton.addEventListener("click", () => addWishlistProductToCart(item.productId, addButton));
            actions.append(addButton);
        }

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-wishlist-item";
        removeButton.textContent = "Remove from Wishlist";
        removeButton.addEventListener("click", () => removeWishlistProduct(item.productId, removeButton));
        actions.append(removeButton);

        content.append(actions);
        card.append(content);
        container.append(card);
    });
}

async function addWishlistProductToCart(productId, button) {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "/login.html";
        return;
    }

    button.disabled = true;
    try {
        const response = await fetch(`${API_URL}/customer/cart`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ productId, quantity: 1 })
        });

        if (response.status === 401) {
            localStorage.removeItem("token");
            window.location.href = "/login.html";
            return;
        }
        if (!response.ok) {
            const error = await readErrorMessage(response);
            throw new Error(error || `Could not add product to cart (HTTP ${response.status}).`);
        }

        window.location.href = "/cart.html";
    } catch (error) {
        console.error("Error adding wishlist product to cart:", error);
        setWishlistStatus(error.message || "Could not add product to cart.", true);
        button.disabled = false;
    }
}

async function removeWishlistProduct(productId, button) {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "/login.html";
        return;
    }

    button.disabled = true;
    try {
        const response = await fetch(`${API_URL}/customer/wishlist/${encodeURIComponent(productId)}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (response.status === 401) {
            localStorage.removeItem("token");
            window.location.href = "/login.html";
            return;
        }
        if (!response.ok) {
            const error = await readErrorMessage(response);
            throw new Error(error || `Could not remove product (HTTP ${response.status}).`);
        }

        button.closest(".wishlist-card").remove();
        if (document.querySelectorAll(".wishlist-card").length === 0) {
            setWishlistStatus("Your wishlist is empty. Products you remove from the cart will be saved here.");
        }
    } catch (error) {
        console.error("Error removing wishlist product:", error);
        setWishlistStatus(error.message || "Could not remove product from wishlist.", true);
        button.disabled = false;
    }
}

async function readErrorMessage(response) {
    try {
        const payload = await response.json();
        return payload.message || "";
    } catch {
        return "";
    }
}

function setWishlistStatus(message, isError = false) {
    const status = document.getElementById("wishlist-status");
    status.textContent = message;
    status.classList.toggle("error", isError);
}
