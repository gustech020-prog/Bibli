# BibliFlow

Sistema web para gestão de biblioteca, com cadastro de livros/clientes e controle de empréstimos.

## Funcionalidades

- Cadastro de livros com ID único.
- Cadastro de clientes com **ID automático** (1, 2, 3...).
- Registro de empréstimo vinculando livro + cliente.
- Vencimento automático em **10 dias**.
- Destaque visual para empréstimos atrasados.
- Indicador de quantidade de atrasos no topo.
- Persistência compartilhada em **SQL (SQLite)** para todos os usuários conectados ao servidor.

## Requisitos

- PHP 7.4+
- Extensão PDO SQLite habilitada

## Como rodar (modo compartilhado)

No diretório `Bibli2`:

```bash
php -S 0.0.0.0:8000
```

Depois acesse:

- `http://localhost:8000/index.html`

> Importante: use servidor PHP (não `python -m http.server`) para o backend funcionar.

## Como funciona o armazenamento compartilhado

- O frontend usa `fetch` para chamar `api.php`.
- O backend salva dados em banco SQL SQLite (`data/bibli.db`).
- Todos os usuários da mesma instância do servidor enxergam as mesmas alterações.

## Produção (multiusuário real)

Para uso real em rede/produção:

1. Hospede em Apache/Nginx + PHP 7.4+.
2. Garanta permissão de escrita em `Bibli2/data/`.
3. Para alto volume, substitua SQLite por MySQL/PostgreSQL mantendo a mesma camada de API.


## Solução de problemas

Se aparecer **"Falha ao inicializar banco SQL (SQLite/PDO)"**:

1. Verifique no `php.ini` se as extensões estão ativas (sem `;`):
   - `extension=pdo_sqlite`
   - `extension=sqlite3`
2. Reinicie Apache/PHP após alterar o `php.ini`.
3. Garanta permissão de escrita na pasta `Bibli2/data`.

No XAMPP, o arquivo costuma ficar em `xampp/php/php.ini`.

