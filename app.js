const STORAGE_KEYS = {
  books: "bibli_books",
  clients: "bibli_clients",
  rentals: "bibli_rentals",
};

const MAX_RENTAL_DAYS = 10;

const state = {
  books: load(STORAGE_KEYS.books),
  clients: load(STORAGE_KEYS.clients),
  rentals: load(STORAGE_KEYS.rentals),
};

const refs = {
  bookForm: document.getElementById("book-form"),
  clientForm: document.getElementById("client-form"),
  rentalForm: document.getElementById("rental-form"),
  bookSelect: document.getElementById("book-select"),
  clientSelect: document.getElementById("client-select"),
  booksList: document.getElementById("books-list"),
  clientsList: document.getElementById("clients-list"),
  rentalsBody: document.getElementById("rentals-body"),
  overdueCount: document.getElementById("overdue-count"),
  emptyTemplate: document.getElementById("empty-state-template"),
};

initialize();

function initialize() {
  refs.bookForm.addEventListener("submit", onSaveBook);
  refs.clientForm.addEventListener("submit", onSaveClient);
  refs.rentalForm.addEventListener("submit", onSaveRental);

  refs.rentalForm.rentalDate.valueAsDate = new Date();
  renderAll();
}

function onSaveBook(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = {
    id: formData.get("id").trim(),
    title: formData.get("title").trim(),
    author: formData.get("author").trim(),
  };

  if (state.books.some((book) => book.id === payload.id)) {
    alert("Já existe um livro com este ID.");
    return;
  }

  state.books.push(payload);
  persist(STORAGE_KEYS.books, state.books);
  event.target.reset();
  renderAll();
}

function onSaveClient(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = {
    id: formData.get("id").trim(),
    name: formData.get("name").trim(),
    contact: formData.get("contact").trim(),
  };

  if (state.clients.some((client) => client.id === payload.id)) {
    alert("Já existe um cliente com este ID.");
    return;
  }

  state.clients.push(payload);
  persist(STORAGE_KEYS.clients, state.clients);
  event.target.reset();
  renderAll();
}

function onSaveRental(event) {
  event.preventDefault();
  if (!state.books.length || !state.clients.length) {
    alert("Cadastre ao menos um livro e um cliente antes de registrar aluguel.");
    return;
  }

  const formData = new FormData(event.target);
  const payload = {
    id: crypto.randomUUID(),
    bookId: formData.get("bookId"),
    clientId: formData.get("clientId"),
    rentalDate: formData.get("rentalDate"),
  };

  const isBookRented = state.rentals.some((rental) => rental.bookId === payload.bookId);
  if (isBookRented) {
    alert("Este livro já está alugado no momento.");
    return;
  }

  state.rentals.push(payload);
  persist(STORAGE_KEYS.rentals, state.rentals);
  event.target.reset();
  refs.rentalForm.rentalDate.valueAsDate = new Date();
  renderAll();
}

function returnRental(rentalId) {
  state.rentals = state.rentals.filter((rental) => rental.id !== rentalId);
  persist(STORAGE_KEYS.rentals, state.rentals);
  renderAll();
}

function renderAll() {
  renderBooks();
  renderClients();
  renderSelectOptions();
  renderRentals();
}

function renderBooks() {
  refs.booksList.innerHTML = "";

  if (!state.books.length) {
    refs.booksList.append(cloneEmpty());
    return;
  }

  state.books.forEach((book) => {
    const li = document.createElement("li");
    li.textContent = `${book.title} (${book.id}) — ${book.author}`;
    refs.booksList.append(li);
  });
}

function renderClients() {
  refs.clientsList.innerHTML = "";

  if (!state.clients.length) {
    refs.clientsList.append(cloneEmpty());
    return;
  }

  state.clients.forEach((client) => {
    const li = document.createElement("li");
    li.textContent = `${client.name} (${client.id}) — ${client.contact}`;
    refs.clientsList.append(li);
  });
}

function renderSelectOptions() {
  refs.bookSelect.innerHTML = "";
  refs.clientSelect.innerHTML = "";

  if (!state.books.length) {
    refs.bookSelect.innerHTML = `<option value="" disabled selected>Cadastre livros primeiro</option>`;
  } else {
    state.books.forEach((book) => {
      const option = document.createElement("option");
      option.value = book.id;
      option.textContent = `${book.title} (${book.id})`;
      refs.bookSelect.append(option);
    });
  }

  if (!state.clients.length) {
    refs.clientSelect.innerHTML = `<option value="" disabled selected>Cadastre clientes primeiro</option>`;
  } else {
    state.clients.forEach((client) => {
      const option = document.createElement("option");
      option.value = client.id;
      option.textContent = `${client.name} (${client.id})`;
      refs.clientSelect.append(option);
    });
  }
}

function renderRentals() {
  refs.rentalsBody.innerHTML = "";

  if (!state.rentals.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="empty">Nenhum aluguel ativo.</td>`;
    refs.rentalsBody.append(tr);
    refs.overdueCount.textContent = "0 atrasados";
    return;
  }

  const overdueTotal = state.rentals.filter((rental) => getRentalStatus(rental).overdue).length;
  refs.overdueCount.textContent = `${overdueTotal} atrasado${overdueTotal !== 1 ? "s" : ""}`;

  state.rentals.forEach((rental) => {
    const book = state.books.find((item) => item.id === rental.bookId);
    const client = state.clients.find((item) => item.id === rental.clientId);
    const status = getRentalStatus(rental);

    const tr = document.createElement("tr");
    if (status.overdue) {
      tr.classList.add("overdue-row");
    }

    tr.innerHTML = `
      <td>${book?.title || "Livro removido"}</td>
      <td>${client?.name || "Cliente removido"}</td>
      <td>${formatDate(rental.rentalDate)}</td>
      <td>${formatDate(status.dueDate)}</td>
      <td><span class="status ${status.overdue ? "overdue" : "ok"}">${status.label}</span></td>
      <td><button class="action-btn" data-id="${rental.id}">Registrar devolução</button></td>
    `;

    tr.querySelector("button").addEventListener("click", () => returnRental(rental.id));
    refs.rentalsBody.append(tr);
  });
}

function getRentalStatus(rental) {
  const rentalDate = new Date(`${rental.rentalDate}T00:00:00`);
  const dueDate = new Date(rentalDate);
  dueDate.setDate(dueDate.getDate() + MAX_RENTAL_DAYS);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const overdue = now > dueDate;

  return {
    overdue,
    dueDate,
    label: overdue ? "Atrasado" : "No prazo",
  };
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("pt-BR");
}

function cloneEmpty() {
  return refs.emptyTemplate.content.firstElementChild.cloneNode(true);
}

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? [];
  } catch {
    return [];
  }
}

function persist(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}
