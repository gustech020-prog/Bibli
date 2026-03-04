# BibliFlow

Sistema web para gestão de biblioteca, com cadastro de livros/clientes e controle de empréstimos.

## Funcionalidades

- Cadastro de livros com ID único.
- Cadastro de clientes com **ID automático** (1, 2, 3...).
- Registro de empréstimo vinculando livro + cliente.
- Vencimento automático em **10 dias**.
- Destaque visual para empréstimos atrasados.
- Indicador de quantidade de atrasos no topo.
- Persistência compartilhada no servidor (arquivo `data/storage.json`) para todos os usuários.

## Requisitos

- PHP 7.4+

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
- O backend salva os dados em `data/storage.json`.
- Qualquer usuário acessando a mesma instância do servidor verá as mesmas alterações.

## Produção (multiusuário real)

Para uso real em rede/produção:

1. Hospede em Apache/Nginx + PHP 7.4+.
2. Garanta permissão de escrita em `Bibli2/data/`.
3. (Recomendado) migrar para banco de dados MySQL/PostgreSQL em vez de JSON para alta concorrência e auditoria.
