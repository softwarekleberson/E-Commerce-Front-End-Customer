document.addEventListener("DOMContentLoaded", async () => {
    const productId = new URLSearchParams(window.location.search).get("id");

    if (!productId) {
        document.querySelector(".product-info").textContent = "ID do brinquedo não informado.";
        return;
    }

    try {
        const response = await fetch(`http://localhost:8080/public/product/${encodeURIComponent(productId)}`);
        if (!response.ok) throw new Error(`Falha ao carregar produto: ${response.status}`);

        const toy = await response.json();
        document.title = `${toy.name || "Brinquedo"} - Hatchards`;
        document.getElementById("name").textContent = toy.name || "Brinquedo";
        document.querySelector(".description").textContent = toy.description || "";
        const currency = toy.typeCoin === "REAL" ? "R$" : (toy.typeCoin || "USD");
        document.querySelector(".price").textContent = `${currency} ${toy.price ?? ""}`;

        const image = document.querySelector(".product-image img");
        if (toy.midias?.[0]?.url) image.src = toy.midias[0].url;
        image.alt = toy.name || "Imagem do brinquedo";

        const specifications = {
            brand: ["Marca", toy.brand],
            toyType: ["Tipo", toy.toyType],
            ageRange: ["Faixa etária", toy.ageRange],
            material: ["Material", toy.material],
            numberOfPieces: ["Número de peças", toy.numberOfPieces],
            batteryRequired: ["Requer bateria", toy.batteryRequired],
            batteryIncluded: ["Bateria incluída", toy.batteryIncluded]
        };

        for (const [id, [label, value]] of Object.entries(specifications)) {
            const item = document.getElementById(id);
            if (value !== null && value !== undefined && value !== "") {
                item.textContent = `${label}: ${value}`;
            } else {
                item.remove();
            }
        }
    } catch (error) {
        console.error("Erro ao carregar detalhes do brinquedo:", error);
        document.querySelector(".product-info").textContent = "Não foi possível carregar os detalhes do brinquedo.";
    }
});
