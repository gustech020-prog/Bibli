# BibliFlow

Sistema web simples para gestão de biblioteca, com cadastro de livros/clientes e controle de aluguéis.

## Funcionalidades

- Cadastro de livros com ID único.
- Cadastro de clientes com ID único.
- Registro de aluguel vinculando livro + cliente.
- Vencimento automático em **10 dias**.
- Destaque visual em vermelho para aluguéis atrasados.
- Indicador de quantidade de atrasos no topo.
- Persistência local no navegador (`localStorage`).

## Como rodar

Basta abrir o `index.html` no navegador.

Ou iniciar servidor local:

```bash
python3 -m http.server 8000
```

Depois acesse `http://localhost:8000`.
