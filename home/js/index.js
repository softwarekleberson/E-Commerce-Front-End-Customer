document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("http://localhost:8080/public/product");
    if (!response.ok) throw new Error(`Erro: ${response.status}`);

    const data = await response.json();
    
    // Se o backend pagina os dados (ex: Spring Pageable), os dados ficam em data.content. 
    // Caso seja uma lista direta, usamos data.
    const produtos = data.content || (Array.isArray(data) ? data : []);

    // Filtro por categoria
    const books = produtos.filter(p => p.category === "BOOKS");
    const bags = produtos.filter(p => p.category === "BAG");
    const toys = produtos.filter(p => p.category === "TOYS");

    const booksContainer = document.getElementById("books-container");
    const bagsContainer = document.getElementById("bags-container");
    const toysContainer = document.getElementById("toys-container");

    if (booksContainer) booksContainer.innerHTML = "";
    if (bagsContainer) bagsContainer.innerHTML = "";
    if (toysContainer) toysContainer.innerHTML = "";

    // Imagem padrão global caso o produto não tenha mídia válida
    const DEFAULT_IMG = 'https://via.placeholder.com/200';

    // Renderizar Livros
    books.forEach(book => {
      const card = document.createElement("div");
      card.classList.add("card");
      
      // Proteções: garante que o preço é um número e que a imagem existe
      const preco = typeof book.price === 'number' ? book.price.toFixed(2) : '0.00';
      const imgUrl = (book.midias && book.midias[0] && book.midias[0].url) ? book.midias[0].url : DEFAULT_IMG;

      card.innerHTML = `
        <img class="card__image" src="${imgUrl}" alt="${book.name || 'Produto'}">
        <h3 class="card__title">${book.name || 'Sem título'}</h3>
        <p class="card__meta">${book.author || 'Autor desconhecido'}</p>
        <div class="card__price">$ ${preco} - ${book.typeCoin || 'USD'}</div>
        <div class="card__actions">
          <button class="btn btn-details">Details</button>
        </div>
      `;
      
      if (booksContainer) {
        booksContainer.appendChild(card);
        card.querySelector('.btn-details').addEventListener('click', () => {
          window.location.href = `book-details.html?id=${book.id}`;
        });
      }
    });

    // Renderizar Bolsas
    bags.forEach(bag => {
      const card = document.createElement("div");
      card.classList.add("card");
      
      // Proteções equivalentes para bolsas
      const preco = typeof bag.price === 'number' ? bag.price.toFixed(2) : '0.00';
      const imgUrl = (bag.midias && bag.midias[0] && bag.midias[0].url) ? bag.midias[0].url : DEFAULT_IMG;

      card.innerHTML = `
        <img class="card__image" src="${imgUrl}" alt="${bag.name || 'Produto'}">
        <h3 class="card__title">${bag.name || 'Sem nome'}</h3>
        <p class="card__meta">${bag.brand || ''}</p>
        <div class="card__price">$ ${preco} - ${bag.typeCoin || 'USD'}</div>
        <div class="card__actions">
          <button class="btn btn-details">Details</button>
        </div>
      `;
      
      if (bagsContainer) {
        bagsContainer.appendChild(card); // Corrigido: passando o elemento HTML 'card'
        card.querySelector('.btn-details').addEventListener('click', () => {
          window.location.href = `bag-details.html?id=${bag.id}`;
        });
      }
    });

    // Renderizar Brinquedos
    toys.forEach(toy => {
      const card = document.createElement("div");
      card.classList.add("card");

      const preco = typeof toy.price === 'number' ? toy.price.toFixed(2) : '0.00';
      const imgUrl = (toy.midias && toy.midias[0] && toy.midias[0].url) ? toy.midias[0].url : DEFAULT_IMG;

      card.innerHTML = `
        <img class="card__image" src="${imgUrl}" alt="${toy.name || 'Brinquedo'}">
        <h3 class="card__title">${toy.name || 'Sem nome'}</h3>
        <p class="card__meta">${toy.brand || toy.toyType || ''}</p>
        <div class="card__price">$ ${preco} - ${toy.typeCoin || 'USD'}</div>
        <div class="card__actions">
          <button class="btn btn-details">Details</button>
        </div>
      `;

      if (toysContainer) {
        toysContainer.appendChild(card);
        card.querySelector('.btn-details').addEventListener('click', () => {
          window.location.href = `toy-details.html?id=${toy.id}`;
        });
      }
    });

    console.log(`Sucesso! Livros encontrados: ${books.length}, Bolsas encontradas: ${bags.length}, Brinquedos encontrados: ${toys.length}`);

  } catch (err) {
    console.error("Erro ao carregar produtos:", err);
  }
});
