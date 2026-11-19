const API_URL = 'http://localhost:8080';
const PAGE_SIZE = 50;

// Função para formatar data
function formatDate(dateString) {
    if (!dateString) return 'Data indisponível';
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

// Mapa de conversão de moedas
const currencyMap = {
    'DOLAR': 'USD',
    'DOLLAR': 'USD',
    'REAL': 'BRL',
    'USD': 'USD',
    'BRL': 'BRL',
    'EUR': 'EUR',
    'GBP': 'GBP'
};

// Símbolos de moeda customizados
const currencySymbols = {
    'USD': 'US$',
    'BRL': 'R$',
    'EUR': '€',
    'GBP': '£'
};

// Função para formatar moeda
function formatCurrency(value, currency) {
    try {
        const isoCode = currencyMap[currency?.toUpperCase()] || 'BRL';
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: isoCode
        }).format(value);
    } catch (error) {
        const symbol = currencySymbols[currency?.toUpperCase()] || 'R$';
        return symbol + ' ' + Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

// Função para buscar orders
async function loadOrders(page = 0, size = PAGE_SIZE) {
    try {
        const token = localStorage.getItem('token');
        
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const response = await fetch(`${API_URL}/customer/orders?page=${page}&size=${size}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
            return;
        }

        if (!response.ok) {
            console.error('Erro ao carregar orders:', response.statusText);
            displayError('Erro ao carregar seus pedidos');
            return;
        }

        const data = await response.json();
        console.log('Orders recebidas:', data);
        
        const orders = data.content || [];
        displayOrders(orders, page, getTotalPages(data, orders, page));
        
    } catch (error) {
        console.error('Erro na requisição:', error);
        displayError('Erro ao conectar com o servidor');
    }
}

// Função para exibir as orders
function getTotalPages(data, orders, page) {
    if (Number.isInteger(data.totalPages)) return data.totalPages;
    if (Number.isFinite(data.totalElements)) return Math.ceil(data.totalElements / PAGE_SIZE);
    return orders.length === PAGE_SIZE ? page + 2 : page + 1;
}

function renderPagination(page, totalPages) {
    const pagination = document.createElement('nav');
    pagination.id = 'orders-pagination';
    pagination.className = 'orders-pagination';
    pagination.setAttribute('aria-label', 'Order pages');
    pagination.hidden = totalPages <= 1;
    if (pagination.hidden) return pagination;

    const previous = document.createElement('button');
    previous.type = 'button';
    previous.textContent = 'Previous';
    previous.disabled = page === 0;
    previous.addEventListener('click', () => loadOrders(page - 1));

    const currentPage = document.createElement('span');
    currentPage.textContent = `Page ${page + 1} of ${totalPages}`;
    currentPage.setAttribute('aria-live', 'polite');

    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = 'Next';
    next.disabled = page >= totalPages - 1;
    next.addEventListener('click', () => loadOrders(page + 1));

    pagination.append(previous, currentPage, next);
    return pagination;
}

function displayOrders(orders, page, totalPages) {
    const mainContainer = document.querySelector('main');
    
    mainContainer.innerHTML = '';
    
    if (!orders || orders.length === 0) {
        mainContainer.innerHTML = '<p style="text-align: center; padding: 50px; font-size: 18px;">Nenhum pedido encontrado</p>';
    } else {
        orders.forEach(order => {
            const orderCard = createOrderCard(order);
            mainContainer.appendChild(orderCard);
        });
    }

    mainContainer.appendChild(renderPagination(page, totalPages));
}

// Função para criar o card de uma order
function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    
    // Leitura do campo 'data' do ListOrdersDto
    const formattedDate = formatDate(order.data);
    
    // Header da order
    const headerHTML = `
        <div class="order-header">
            <div class="info-group">
                <span>ORDER PLACED</span>
                <p>${formattedDate}</p>
            </div>
            <div class="info-group">
                <span>TOTAL</span>
                <p>${formatCurrency(order.total, order.currency)}</p>
            </div>
            <div class="info-group">
                <span>SHIPPING</span>
                <p>${formatCurrency(order.shippingCost, order.currency)}</p>
            </div>
            <div class="info-group">
                <span>ORDER STATUS</span>
                <p>${order.orderStatus || 'Processando'}</p>
            </div>
            <div class="order-id">
                <span>ORDER # ${order.orderId}</span>
            </div>
        </div>
    `;
    
    // Body da order com itens
    let itemsHTML = '<div class="product-content">';
    
    if (order.itens && order.itens.length > 0) {
        order.itens.forEach(item => {
            const itemReservationId = item.reservationId || item.reservation_id || item.reservationid || '';
            itemsHTML += `
                <div class="product-detail">
                    <div class="product-text">
                        <p><strong>Product:</strong> ${item.productId}</p>
                        <p><strong>Quantit:</strong> ${item.quantity}</p>
                        <p><strong>Price:</strong> ${formatCurrency(item.price, order.currency)}</p>
                        <p><strong>Subtotal:</strong> ${formatCurrency(item.subtotal, order.currency)}</p>
                        <p><strong>Status:</strong> ${item.itemStatus || 'Disponível'}</p>
                        <input type="hidden" class="reservation-id" value="${itemReservationId}" data-reservation-id="${itemReservationId}">
                    </div>
                        <div class="order-actions">
                            <button class="btn-white" type="button">Cancel Item</button>
                            <button class="btn-white replacement-btn" type="button" data-order-id="${order.orderId || ''}" data-reservation-id="${itemReservationId}" data-quantity="${item.quantity ?? ''}">Return or Replace Items</button>
                            <button class="btn-white track-package-btn" type="button" data-order-id="${order.orderId}" data-reservation-id="${itemReservationId}">Track Package</button>
                        </div>
                </div>
            `;
        });
    } else {
        itemsHTML += '<p>Empty Card</p>';
    }
    
    itemsHTML += '</div>';
    
    const bodyHTML = `
        <div class="order-body">
            ${itemsHTML}
        </div>
    `;
    
    card.innerHTML = headerHTML + bodyHTML;

    card.querySelectorAll('.replacement-btn').forEach((replacementButton) => {
        replacementButton.addEventListener('click', () => {
            const reservationId = replacementButton.dataset.reservationId || '';
            const orderId = replacementButton.dataset.orderId || '';
            const quantity = replacementButton.dataset.quantity || '';
            sessionStorage.setItem('replacementQuantity', quantity);
            const params = new URLSearchParams({ orderId, reservationId });
            window.location.assign(`replacement.html?${params.toString()}`);
        });
    });

    card.querySelectorAll('.track-package-btn').forEach((trackButton) => {
        trackButton.addEventListener('click', () => {
            const params = new URLSearchParams({
                orderId: trackButton.dataset.orderId || '',
                reservationId: trackButton.dataset.reservationId || ''
            });
            window.location.assign(`transport.html?${params.toString()}`);
        });
    });

    return card;
}

// Função para exibir erro
function displayError(message) {
    const mainContainer = document.querySelector('main');
    mainContainer.innerHTML = `<p style="text-align: center; padding: 50px; font-size: 18px; color: red;">${message}</p>`;
}

// Carregar orders quando a página estiver pronta
document.addEventListener('DOMContentLoaded', () => {
    loadOrders();
});