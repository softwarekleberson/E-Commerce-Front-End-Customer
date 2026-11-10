# Front End Cliente

Este projeto é uma aplicação web front-end para clientes, com foco em navegação de produtos, carrinho, checkout, pagamentos, cadastro e acompanhamento de pedidos. A interface foi construída com HTML, CSS e JavaScript, e os testes end-to-end são executados com Playwright.

## Funcionalidades

- Catálogo de produtos e detalhes
- Carrinho de compras
- Checkout e pagamento
- Cadastro e atualização de cliente
- Gestão de endereço e entrega
- Lista de pedidos e detalhes
- Aplicação de vouchers/cupons
- Troca/replacement de pedidos
- Chat de atendimento
- Fluxos de autenticação e recuperação de senha

## Tecnologias utilizadas

- HTML5
- CSS3
- JavaScript
- Node.js
- Playwright
- Live Server

## Pré-requisitos

Antes de rodar o projeto, certifique-se de ter instalado:

- Node.js (versão 18 ou superior recomendado)
- npm
- Navegador Google Chrome ou Chromium (para os testes automatizados)

## Instalação

No diretório raiz do projeto, execute:

```bash
npm install
```

## Como executar a aplicação

Como o projeto é estático, a forma mais simples é iniciar um servidor local:

```bash
npx live-server
```

Isso vai servir a aplicação localmente, geralmente em uma porta como `8080` ou `5500`, dependendo da configuração do ambiente. Acesse a URL exibida no terminal para abrir a interface.

Se preferir, também é possível abrir diretamente os arquivos HTML em um navegador, mas o uso de um servidor local é recomendado para evitar problemas com rotas e carregamento de recursos.

## Scripts disponíveis

O projeto já inclui alguns scripts em `package.json`:

```bash
npm test
npm run test:headed
npm run test:ui
```

## Executando os testes

Os testes estão organizados em pastas por funcionalidade, como:

- `tests/carrinho`
- `tests/checkout`
- `tests/cliente`
- `tests/replacement`
- `tests/troca`

Para rodar o conjunto de testes de cliente:

```bash
npx playwright test tests/cliente --headed --workers=1
```

Para rodar os testes de carrinho e checkout:

```bash
npx playwright test tests/carrinho/ tests/checkout/ --headed --workers=1
```

Para rodar os testes de troca/replacement:

```bash
npx playwright test tests/replacement tests/troca --project=chromium --headed
```

## Estrutura do projeto

```text
.
├── index.html
├── login.html
├── cart.html
├── checkout.html
├── orders.html
├── home-customer.html
├── ...
├── card/
├── cart/
├── checkout/
├── customer/
├── details/
├── home/
├── login-customer/
├── orders/
├── replacement/
├── transport/
├── voucher/
├── tests/
├── package.json
├── playwright.config.ts
└── README.md
```

## Observações

- Este é um front-end de cliente, portanto, a interação com serviços e APIs depende da infraestrutura ou backend que estiver alimentando a aplicação.
- Certifique-se de que o ambiente de execução e as APIs de destino estejam configurados corretamente antes de testar fluxos completos da aplicação.

## Licença

Este projeto não especifica uma licença no repositório; verifique com a equipe responsável antes de reutilizar ou redistribuir o código em outros contextos.
