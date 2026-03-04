const STORAGE_KEY = "bibli-flow-data";
const THEME_KEY = "bibli-flow-theme";
const RENTAL_LIMIT_DAYS = 10;
const CPF_DIGITS = 11;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 11;

const state = {
  books: [],
  clients: [],
  rentals: [],
};

let editingBookId = null;
let editingClientId = null;

const els = {
  bookForm: document.querySelector("#bookForm"),
  clientForm: document.querySelector("#clientForm"),
  rentalForm: document.querySelector("#rentalForm"),
  booksTable: document.querySelector("#booksTable"),
  clientsTable: document.querySelector("#clientsTable"),
  activeRentalsTable: document.querySelector("#activeRentalsTable"),
  rentalsHistoryTable: document.querySelector("#rentalsHistoryTable"),
  rentalBook: document.querySelector("#rentalBook"),
  rentalClient: document.querySelector("#rentalClient"),
  rentalStart: document.querySelector("#rentalStart"),
  booksCount: document.querySelector("#booksCount"),
  clientsCount: document.querySelector("#clientsCount"),
  overdueCount: document.querySelector("#overdueCount"),
  overdueCard: document.querySelector("#overdueCard"),
  toast: document.querySelector("#toast"),
  themeToggle: document.querySelector("#themeToggle"),
  deleteHistoryBtn: document.querySelector("#deleteHistoryBtn"),
};

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    state.books = Array.isArray(data.books) ? data.books : [];
    state.clients = Array.isArray(data.clients) ? data.clients : [];
    state.rentals = (Array.isArray(data.rentals) ? data.rentals : []).map((r) => ({
      ...r,
      returnedDate: r.returnedDate || null,
    }));
  } catch {
    notify("Dados locais inválidos. Reiniciando sistema.");
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function notify(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (els.themeToggle) {
    els.themeToggle.setAttribute("aria-label", theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro");
  }
  document.documentElement.style.backgroundColor = "";
}

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const theme = savedTheme === "dark" ? "dark" : "light";
  applyTheme(theme);

  if (!els.themeToggle) return;
  els.themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, nextTheme);
    applyTheme(nextTheme);
  });
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function addDays(dateISO, days) {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(dateInput) {
  if (!dateInput) return "-";
  const d = new Date(dateInput + (dateInput.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("pt-BR");
}

function isOverdue(dueDateISO) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dueDateISO + "T00:00:00");
  return dueDate < today;
}

function sanitizeDigits(value) {
  return value.replace(/\D/g, "");
}

function activeRentals() {
  return state.rentals.filter((r) => !r.returnedDate);
}

function availableBooks() {
  const rentedBookIds = new Set(activeRentals().map((r) => r.bookId));
  return state.books.filter((book) => !rentedBookIds.has(book.id));
}

function getBookById(id) {
  return state.books.find((b) => b.id === id);
}

function getClientById(id) {
  return state.clients.find((c) => c.id === id);
}

function ensureDataCompatibility() {
  state.clients = state.clients.map((client) => ({
    ...client,
    cpf: sanitizeDigits(client.cpf || ""),
    phone: sanitizeDigits(client.phone || ""),
  }));
}

function updateStats() {
  if (!els.booksCount || !els.clientsCount || !els.overdueCount || !els.overdueCard) return;
  const overdueCount = activeRentals().filter((r) => isOverdue(r.dueDate)).length;
  els.booksCount.textContent = String(state.books.length);
  els.clientsCount.textContent = String(state.clients.length);
  els.overdueCount.textContent = String(overdueCount);
  els.overdueCard.classList.toggle("active", overdueCount > 0);
}

function renderBookOptions() {
  if (!els.rentalBook) return;
  const selectedValue = els.rentalBook.value;
  const books = availableBooks();
  const options = [
    `<option value="">Selecione um livro</option>`,
    ...books.map((book) => `<option value="${book.id}">${book.id} • ${book.title}</option>`),
  ];
  els.rentalBook.innerHTML = options.join("");
  els.rentalBook.disabled = books.length === 0;

  if (books.some((book) => book.id === selectedValue)) {
    els.rentalBook.value = selectedValue;
  }
}

function renderClientOptions() {
  if (!els.rentalClient) return;
  const selectedValue = els.rentalClient.value;
  const options = [
    `<option value="">Selecione um cliente</option>`,
    ...state.clients.map((client) => `<option value="${client.id}">${client.id} • ${client.name}</option>`),
  ];
  els.rentalClient.innerHTML = options.join("");
  els.rentalClient.disabled = state.clients.length === 0;

  if (state.clients.some((client) => client.id === selectedValue)) {
    els.rentalClient.value = selectedValue;
  }
}

function renderBooks() {
  if (!els.booksTable) return;
  if (!state.books.length) {
    els.booksTable.innerHTML = `<tr><td colspan="5">Nenhum livro cadastrado.</td></tr>`;
    return;
  }

  const rentedIds = new Set(activeRentals().map((r) => r.bookId));

  els.booksTable.innerHTML = state.books
    .map((book) => {
      const busy = rentedIds.has(book.id);
      return `<tr>
        <td>${book.id}</td>
        <td>${book.title}</td>
        <td>${book.author}</td>
        <td><span class="status ${busy ? "status-danger" : "status-ok"}">${
        busy ? "Emprestado" : "Disponível"
      }</span></td>
        <td class="row-actions">
          <button type="button" class="action-btn icon-btn" title="Editar livro" aria-label="Editar livro" data-edit-book="${book.id}">✏️</button>
          <button type="button" class="action-btn warn icon-btn" title="Excluir livro" aria-label="Excluir livro" data-remove-book="${book.id}">🗑</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderClients() {
  if (!els.clientsTable) return;
  if (!state.clients.length) {
    els.clientsTable.innerHTML = `<tr><td colspan="5">Nenhum cliente cadastrado.</td></tr>`;
    return;
  }

  els.clientsTable.innerHTML = state.clients
    .map(
      (client) => `<tr>
      <td>${client.id}</td>
      <td>${client.name}</td>
      <td>${client.cpf || "-"}</td>
      <td>${client.phone || "-"}</td>
      <td class="row-actions">
        <button type="button" class="action-btn icon-btn" title="Editar cliente" aria-label="Editar cliente" data-edit-client="${client.id}">✏️</button>
        <button type="button" class="action-btn warn icon-btn" title="Excluir cliente" aria-label="Excluir cliente" data-remove-client="${client.id}">🗑</button>
      </td>
    </tr>`
    )
    .join("");
}

function renderActiveRentals() {
  if (!els.activeRentalsTable) return;
  const rentals = activeRentals();
  if (!rentals.length) {
    els.activeRentalsTable.innerHTML = `<tr><td colspan="7">Nenhum empréstimo ativo.</td></tr>`;
    return;
  }

  els.activeRentalsTable.innerHTML = rentals
    .map((rental) => {
      const overdue = isOverdue(rental.dueDate);
      const book = getBookById(rental.bookId);
      const client = getClientById(rental.clientId);
      return `<tr class="${overdue ? "overdue" : ""}">
      <td>${book ? book.title : rental.bookId}</td>
      <td>${client ? client.name : rental.clientId}</td>
      <td>${fmtDate(rental.startDate)}</td>
      <td>${fmtDate(rental.dueDate)}</td>
      <td>-</td>
      <td><span class="status ${overdue ? "status-danger" : "status-ok"}">${
        overdue ? "Atrasado" : "No prazo"
      }</span></td>
      <td><button type="button" class="action-btn" data-return-book="${rental.bookId}">Dar baixa</button></td>
    </tr>`;
    })
    .join("");
}

function renderRentalsHistory() {
  if (!els.rentalsHistoryTable) return;
  if (!state.rentals.length) {
    els.rentalsHistoryTable.innerHTML = `<tr><td colspan="7">Nenhum histórico de empréstimo.</td></tr>`;
    return;
  }

  els.rentalsHistoryTable.innerHTML = state.rentals
    .map((rental, idx) => {
      const book = getBookById(rental.bookId);
      const client = getClientById(rental.clientId);
      const status = rental.returnedDate
        ? `<span class="status status-ok">Devolvido</span>`
        : `<span class="status ${isOverdue(rental.dueDate) ? "status-danger" : "status-ok"}">${
            isOverdue(rental.dueDate) ? "Atrasado" : "Ativo"
          }</span>`;

      return `<tr>
      <td><input type="checkbox" class="history-check" data-history-index="${idx}" /></td>
      <td>${book ? book.title : rental.bookId}</td>
      <td>${client ? client.name : rental.clientId}</td>
      <td>${fmtDate(rental.startDate)}</td>
      <td>${fmtDate(rental.dueDate)}</td>
      <td>${fmtDate(rental.returnedDate)}</td>
      <td>${status}</td>
    </tr>`;
    })
    .join("");
}

function renderAll() {
  renderBooks();
  renderClients();
  renderActiveRentals();
  renderRentalsHistory();
  renderBookOptions();
  renderClientOptions();
  updateStats();
}

function setBookFormMode(editing) {
  if (!els.bookForm) return;
  const submitBtn = els.bookForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = editing ? "Atualizar Livro" : "Salvar Livro";
}

function setClientFormMode(editing) {
  if (!els.clientForm) return;
  const submitBtn = els.clientForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = editing ? "Atualizar Cliente" : "Salvar Cliente";
}

function handleBookSubmit(e) {
  e.preventDefault();
  const idInput = document.querySelector("#bookId");
  const id = sanitizeDigits(idInput?.value.trim() || "");
  const title = document.querySelector("#bookTitle")?.value.trim() || "";
  const author = document.querySelector("#bookAuthor")?.value.trim() || "";

  if (!id) {
    notify("ID do livro deve conter apenas números.");
    return;
  }

  if (editingBookId && editingBookId !== id && state.books.some((book) => book.id === id)) {
    notify("Já existe um livro com este ID.");
    return;
  }

  if (!editingBookId && state.books.some((book) => book.id === id)) {
    notify("Já existe um livro com este ID.");
    return;
  }

  if (editingBookId) {
    const target = state.books.find((b) => b.id === editingBookId);
    if (target) {
      const active = state.rentals.find((r) => r.bookId === editingBookId && !r.returnedDate);
      if (active) active.bookId = id;
      state.rentals.forEach((r) => {
        if (r.bookId === editingBookId) r.bookId = id;
      });
      target.id = id;
      target.title = title;
      target.author = author;
    }
    editingBookId = null;
    setBookFormMode(false);
    notify("Livro atualizado com sucesso.");
  } else {
    state.books.push({ id, title, author });
    notify("Livro cadastrado com sucesso.");
  }

  saveData();
  renderAll();
  e.target.reset();
}

function handleClientSubmit(e) {
  e.preventDefault();
  const id = document.querySelector("#clientId")?.value.trim() || "";
  const name = document.querySelector("#clientName")?.value.trim() || "";
  const cpf = sanitizeDigits(document.querySelector("#clientCpf")?.value.trim() || "");
  const phone = sanitizeDigits(document.querySelector("#clientPhone")?.value.trim() || "");

  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/.test(name)) {
    notify("Nome do cliente deve conter apenas letras.");
    return;
  }

  if (cpf.length !== CPF_DIGITS) {
    notify("CPF deve ter 11 números.");
    return;
  }

  if (phone.length < PHONE_MIN_DIGITS || phone.length > PHONE_MAX_DIGITS) {
    notify("Telefone deve ter 10 ou 11 números.");
    return;
  }

  if (editingClientId && editingClientId !== id && state.clients.some((c) => c.id === id)) {
    notify("Já existe um cliente com este ID.");
    return;
  }

  if (!editingClientId && state.clients.some((client) => client.id === id)) {
    notify("Já existe um cliente com este ID.");
    return;
  }

  if (state.clients.some((client) => client.cpf === cpf && client.id !== editingClientId)) {
    notify("Já existe um cliente com este CPF.");
    return;
  }

  if (editingClientId) {
    const target = state.clients.find((c) => c.id === editingClientId);
    if (target) {
      state.rentals.forEach((r) => {
        if (r.clientId === editingClientId) r.clientId = id;
      });
      target.id = id;
      target.name = name;
      target.cpf = cpf;
      target.phone = phone;
    }
    editingClientId = null;
    setClientFormMode(false);
    notify("Cliente atualizado com sucesso.");
  } else {
    state.clients.push({ id, name, cpf, phone });
    notify("Cliente cadastrado com sucesso.");
  }

  saveData();
  renderAll();
  e.target.reset();
}

function handleRentalSubmit(e) {
  e.preventDefault();
  const bookId = els.rentalBook?.value;
  const clientId = els.rentalClient?.value;
  const startDate = els.rentalStart?.value;

  if (!bookId || !clientId || !startDate) {
    notify("Selecione livro, cliente e data de início.");
    return;
  }

  const book = getBookById(bookId);
  const client = getClientById(clientId);

  if (!book) {
    notify("Livro selecionado é inválido. Atualize a página e selecione novamente.");
    renderBookOptions();
    return;
  }

  if (!client) {
    notify("Cliente selecionado é inválido. Atualize a página e selecione novamente.");
    renderClientOptions();
    return;
  }

  if (activeRentals().some((rental) => rental.bookId === bookId)) {
    notify("Este livro já está emprestado.");
    renderBookOptions();
    return;
  }

  const dueDate = addDays(startDate, RENTAL_LIMIT_DAYS).toISOString().slice(0, 10);
  state.rentals.push({ bookId, clientId, startDate, dueDate, returnedDate: null });
  saveData();
  renderAll();
  e.target.reset();
  if (els.rentalStart) {
    els.rentalStart.value = todayISO();
  }
  notify("Empréstimo registrado por 10 dias.");
}

function deleteSelectedHistory() {
  const selected = Array.from(document.querySelectorAll('.history-check:checked')).map((el) =>
    Number(el.dataset.historyIndex)
  );

  if (!selected.length) {
    notify("Selecione itens do histórico para apagar.");
    return;
  }

  state.rentals = state.rentals.filter((_, idx) => !selected.includes(idx));
  saveData();
  renderAll();
  notify("Itens selecionados do histórico foram apagados.");
}

function handleTableClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;

  const returnBook = btn.dataset.returnBook;
  const removeBook = btn.dataset.removeBook;
  const removeClient = btn.dataset.removeClient;
  const editBook = btn.dataset.editBook;
  const editClient = btn.dataset.editClient;

  if (editBook) {
    const book = getBookById(editBook);
    if (!book) return;
    editingBookId = editBook;
    document.querySelector("#bookId").value = book.id;
    document.querySelector("#bookTitle").value = book.title;
    document.querySelector("#bookAuthor").value = book.author;
    setBookFormMode(true);
    notify("Editando livro.");
    return;
  }

  if (editClient) {
    const client = getClientById(editClient);
    if (!client) return;
    editingClientId = editClient;
    document.querySelector("#clientId").value = client.id;
    document.querySelector("#clientName").value = client.name;
    document.querySelector("#clientCpf").value = client.cpf;
    document.querySelector("#clientPhone").value = client.phone;
    setClientFormMode(true);
    notify("Editando cliente.");
    return;
  }

  if (returnBook) {
    const rental = state.rentals.find((item) => item.bookId === returnBook && !item.returnedDate);
    if (rental) {
      rental.returnedDate = todayISO();
      notify("Livro devolvido e registrado no histórico.");
    }
  }

  if (removeBook) {
    if (activeRentals().some((r) => r.bookId === removeBook)) {
      notify("Não é possível excluir um livro emprestado.");
      return;
    }
    state.books = state.books.filter((book) => book.id !== removeBook);
    notify("Livro excluído.");
  }

  if (removeClient) {
    if (activeRentals().some((r) => r.clientId === removeClient)) {
      notify("Não é possível excluir cliente com empréstimo ativo.");
      return;
    }
    state.clients = state.clients.filter((client) => client.id !== removeClient);
    notify("Cliente excluído.");
  }

  saveData();
  renderAll();
}

function bindNumericInput(selector, maxLength) {
  const input = document.querySelector(selector);
  if (!input) return;

  input.addEventListener("input", () => {
    const digitsOnly = sanitizeDigits(input.value);
    input.value = maxLength ? digitsOnly.slice(0, maxLength) : digitsOnly;
  });
}

function init() {
  initTheme();
  loadData();
  ensureDataCompatibility();
  saveData();

  if (els.rentalStart) {
    els.rentalStart.value = todayISO();
  }

  if (els.bookForm) {
    els.bookForm.addEventListener("submit", handleBookSubmit);
    setBookFormMode(false);
  }
  if (els.clientForm) {
    els.clientForm.addEventListener("submit", handleClientSubmit);
    setClientFormMode(false);
  }
  if (els.rentalForm) {
    els.rentalForm.addEventListener("submit", handleRentalSubmit);
  }
  if (els.deleteHistoryBtn) {
    els.deleteHistoryBtn.addEventListener("click", deleteSelectedHistory);
  }

  document.body.addEventListener("click", handleTableClick);
  bindNumericInput("#bookId");
  bindNumericInput("#clientCpf", CPF_DIGITS);
  bindNumericInput("#clientPhone", PHONE_MAX_DIGITS);

  renderAll();
}

init();
