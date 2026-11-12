const PRODUCT_API = "http://localhost:8080/public/product";
const DEFAULT_IMAGE = "https://via.placeholder.com/200";

function createProductCard(product) {
  const card = document.createElement("article");
  card.className = "card";

  const image = document.createElement("img");
  image.className = "card__image";
  image.src = product.midias?.[0]?.url || DEFAULT_IMAGE;
  image.alt = product.name || "Product";
  image.loading = "lazy";
  image.onerror = () => { image.src = DEFAULT_IMAGE; };

  const title = document.createElement("h3");
  title.className = "card__title";
  title.textContent = product.name || "Untitled product";

  const meta = document.createElement("p");
  meta.className = "card__meta";
  meta.textContent = product.author || product.brand || product.toyType || "";

  const price = document.createElement("p");
  price.className = "card__price";
  const amount = Number(product.price);
  price.textContent = Number.isFinite(amount)
    ? `${product.typeCoin || ""} ${amount.toFixed(2)}`.trim()
    : "Price unavailable";

  const actions = document.createElement("div");
  actions.className = "card__actions";
  const details = document.createElement("a");
  details.className = "btn btn-details";
  details.textContent = "Details";
  const pageByCategory = { BOOKS: "book-details.html", BAG: "bag-details.html", TOYS: "toy-details.html" };
  details.href = `${pageByCategory[product.category] || "details.html"}?id=${encodeURIComponent(product.id)}`;
  actions.append(details);

  card.append(image, title, meta, price, actions);
  return card;
}

function renderProducts(products, container) {
  container.replaceChildren(...products.map(createProductCard));
}

async function fetchProducts(params = new URLSearchParams()) {
  params.set("page", "0");
  params.set("size", "50");
  const response = await fetch(`${PRODUCT_API}/search?${params.toString()}`);
  if (!response.ok) throw new Error(`Product search failed (${response.status})`);
  const data = await response.json();
  return data.content || [];
}

function getFilters() {
  const params = new URLSearchParams();
  const query = document.querySelector("#product-search-form [name=name]").value.trim();
  const category = document.getElementById("product-category").value;
  const typeCoin = document.getElementById("product-currency").value;
  const minimumPrice = document.getElementById("minimum-price").value;
  const maximumPrice = document.getElementById("maximum-price").value;
  if (query) params.set("name", query);
  if (category) params.set("category", category);
  if (typeCoin) params.set("typeCoin", typeCoin);
  if (minimumPrice) params.set("minimumPrice", minimumPrice);
  if (maximumPrice) params.set("maximumPrice", maximumPrice);
  return params;
}

async function searchProducts() {
  const status = document.getElementById("product-search-status");
  const results = document.getElementById("search-results");
  const resultsContainer = document.getElementById("search-results-container");
  const catalog = ["books-container", "bags-container", "toys-container"];
  results.hidden = false;
  catalog.forEach(id => { document.getElementById(id).hidden = true; });
  status.hidden = false;
  status.textContent = "Searching products…";
  resultsContainer.replaceChildren();

  try {
    const products = await fetchProducts(getFilters());
    renderProducts(products, resultsContainer);
    status.textContent = products.length
      ? `${products.length} product(s) found.`
      : "No products found for these filters.";
  } catch (error) {
    console.error("Error searching products:", error);
    status.textContent = "Could not load products. Please try again.";
  }
}

async function loadCatalog() {
  try {
    const params = new URLSearchParams({ page: "0", size: "50" });
    const response = await fetch(`${PRODUCT_API}?${params}`);
    if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
    const data = await response.json();
    const products = data.content || [];
    renderProducts(products.filter(p => p.category === "BOOKS"), document.getElementById("books-container"));
    renderProducts(products.filter(p => p.category === "BAG"), document.getElementById("bags-container"));
    renderProducts(products.filter(p => p.category === "TOYS"), document.getElementById("toys-container"));
  } catch (error) {
    console.error("Error loading products:", error);
    const status = document.getElementById("product-search-status");
    status.hidden = false;
    status.textContent = "Could not load products.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("product-search-form");
  form.addEventListener("submit", event => {
    event.preventDefault();
    searchProducts();
  });
  document.getElementById("apply-product-filters").addEventListener("click", searchProducts);
  document.getElementById("clear-product-filters").addEventListener("click", () => {
    form.reset();
    document.getElementById("product-category").value = "";
    document.getElementById("product-currency").value = "";
    document.getElementById("minimum-price").value = "";
    document.getElementById("maximum-price").value = "";
    document.getElementById("search-results").hidden = true;
    document.getElementById("product-search-status").hidden = true;
    ["books-container", "bags-container", "toys-container"].forEach(id => {
      document.getElementById(id).hidden = false;
    });
  });
  loadCatalog();
});
