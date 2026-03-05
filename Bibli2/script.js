const API_URL = "api.php";
const THEME_KEY = "bibli-flow-theme";
const RENTAL_LIMIT_DAYS = 10;
const CPF_DIGITS = 11;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 11;

const EDIT_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4 20h4l10.2-10.2a2.2 2.2 0 0 0 0-3.1l-.9-.9a2.2 2.2 0 0 0-3.1 0L4 16v4z"></path>
  <path d="M12.5 7.5l4 4"></path>
</svg>`;

const TRASH_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4 7h16"></path>
  <path d="M9 7V5h6v2"></path>
  <path d="M7 7l1 12h8l1-12"></path>
  <path d="M10 11v6"></path>
  <path d="M14 11v6"></path>
</svg>`;

const state = { books: [], clients: [], rentals: [] };
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
  bookEditModal: document.querySelector("#bookEditModal"),
  bookEditForm: document.querySelector("#bookEditForm"),
  bookEditCancel: document.querySelector("#bookEditCancel"),
  clientEditModal: document.querySelector("#clientEditModal"),
  clientEditForm: document.querySelector("#clientEditForm"),
  clientEditCancel: document.querySelector("#clientEditCancel"),
  booksSearch: document.querySelector("#booksSearch"),
  clientsSearch: document.querySelector("#clientsSearch"),
  rentalsSearch: document.querySelector("#rentalsSearch"),
};

async function api(action, payload = {}, method = "POST") {
  const url = `${API_URL}?action=${encodeURIComponent(action)}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(payload) : undefined,
  });

  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_err) {
    throw new Error("Servidor indisponível. Inicie com: php -S 0.0.0.0:8000");
  }

  if (!res.ok || data.ok === false) {
    throw new Error(data.message || "Falha na comunicação com servidor.");
  }
  return data;
}

async function loadState() {
  const data = await api("state", {}, "GET");
  state.books = data.state.books || [];
  state.clients = data.state.clients || [];
  state.rentals = data.state.rentals || [];
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
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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


function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function includesQuery(haystack, query) {
  if (!query) return true;
  return normalizeText(haystack).includes(query);
}

function getSearchValue(input) {
  return normalizeText(input?.value || "");
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
  els.rentalBook.innerHTML = [`<option value="">Selecione um livro</option>`, ...books.map((book) => `<option value="${book.id}">${book.id} • ${book.title}</option>`)].join("");
  els.rentalBook.disabled = books.length === 0;
  if (books.some((book) => book.id === selectedValue)) els.rentalBook.value = selectedValue;
}

function renderClientOptions() {
  if (!els.rentalClient) return;
  const selectedValue = els.rentalClient.value;
  els.rentalClient.innerHTML = [`<option value="">Selecione um cliente</option>`, ...state.clients.map((client) => `<option value="${client.id}">${client.id} • ${client.name}</option>`)].join("");
  els.rentalClient.disabled = state.clients.length === 0;
  if (state.clients.some((client) => client.id === selectedValue)) els.rentalClient.value = selectedValue;
}

function renderBooks() {
  if (!els.booksTable) return;
  const query = getSearchValue(els.booksSearch);
  const books = state.books.filter((book) => {
    const status = activeRentals().some((r) => r.bookId === book.id) ? "emprestado" : "disponivel";
    const text = `${book.id} ${book.title} ${book.author} ${book.location || ""} ${book.genre || ""} ${book.publisher || ""} ${status}`;
    return includesQuery(text, query);
  });

  if (!books.length) {
    const emptyMsg = state.books.length ? "Nenhum livro encontrado." : "Nenhum livro cadastrado.";
    els.booksTable.innerHTML = `<tr><td colspan="8">${emptyMsg}</td></tr>`;
    return;
  }

  const rentedIds = new Set(activeRentals().map((r) => r.bookId));
  els.booksTable.innerHTML = books
    .map((book) => `<tr>
        <td>${book.id}</td>
        <td>${book.title}</td>
        <td>${book.author}</td>
        <td>${book.location || "-"}</td>
        <td>${book.genre || "-"}</td>
        <td>${book.publisher || "-"}</td>
        <td><span class="status ${rentedIds.has(book.id) ? "status-danger" : "status-ok"}">${rentedIds.has(book.id) ? "Emprestado" : "Disponível"}</span></td>
        <td class="row-actions">
          <button type="button" class="action-btn icon-btn" title="Editar livro" aria-label="Editar livro" data-edit-book="${book.id}">${EDIT_ICON}</button>
          <button type="button" class="action-btn warn icon-btn" title="Excluir livro" aria-label="Excluir livro" data-remove-book="${book.id}">${TRASH_ICON}</button>
        </td>
      </tr>`)
    .join("");
}

function renderClients() {
  if (!els.clientsTable) return;
  const query = getSearchValue(els.clientsSearch);
  const clients = state.clients.filter((client) => includesQuery(`${client.id} ${client.name} ${client.cpf || ""} ${client.phone || ""} ${client.address || ""}`, query));

  if (!clients.length) {
    const emptyMsg = state.clients.length ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado.";
    els.clientsTable.innerHTML = `<tr><td colspan="6">${emptyMsg}</td></tr>`;
    return;
  }

  els.clientsTable.innerHTML = clients
    .map((client) => `<tr>
      <td>${client.id}</td>
      <td>${client.name}</td>
      <td>${client.cpf || "-"}</td>
      <td>${client.phone || "-"}</td>
      <td>${client.address || "-"}</td>
      <td class="row-actions">
        <button type="button" class="action-btn icon-btn" title="Editar cliente" aria-label="Editar cliente" data-edit-client="${client.id}">${EDIT_ICON}</button>
        <button type="button" class="action-btn warn icon-btn" title="Excluir cliente" aria-label="Excluir cliente" data-remove-client="${client.id}">${TRASH_ICON}</button>
      </td>
    </tr>`)
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
      <td><span class="status ${overdue ? "status-danger" : "status-ok"}">${overdue ? "Atrasado" : "No prazo"}</span></td>
      <td><button type="button" class="action-btn" data-return-book="${rental.bookId}">Dar baixa</button></td>
    </tr>`;
    })
    .join("");
}

function renderRentalsHistory() {
  if (!els.rentalsHistoryTable) return;
  const query = getSearchValue(els.rentalsSearch);
  const rentals = state.rentals
    .map((rental, index) => ({ rental, index }))
    .filter(({ rental }) => {
      const book = getBookById(rental.bookId);
      const client = getClientById(rental.clientId);
      const overdue = isOverdue(rental.dueDate);
      const statusText = rental.returnedDate ? "devolvido" : overdue ? "atrasado" : "ativo";
      const text = `${book?.id || rental.bookId} ${book?.title || ""} ${book?.author || ""} ${book?.location || ""} ${book?.genre || ""} ${book?.publisher || ""} ${client?.id || rental.clientId} ${client?.name || ""} ${client?.cpf || ""} ${client?.phone || ""} ${client?.address || ""} ${fmtDate(rental.startDate)} ${fmtDate(rental.dueDate)} ${fmtDate(rental.returnedDate)} ${statusText}`;
      return includesQuery(text, query);
    });

  if (!rentals.length) {
    const emptyMsg = state.rentals.length ? "Nenhum empréstimo encontrado no histórico." : "Nenhum histórico de empréstimo.";
    els.rentalsHistoryTable.innerHTML = `<tr><td colspan="7">${emptyMsg}</td></tr>`;
    return;
  }

  els.rentalsHistoryTable.innerHTML = rentals
    .map(({ rental, index }) => {
      const book = getBookById(rental.bookId);
      const client = getClientById(rental.clientId);
      const overdue = isOverdue(rental.dueDate);
      const status = rental.returnedDate ? `<span class="status status-ok">Devolvido</span>` : `<span class="status ${overdue ? "status-danger" : "status-ok"}">${overdue ? "Atrasado" : "Ativo"}</span>`;
      return `<tr>
      <td><input type="checkbox" class="history-check" data-history-index="${index}" /></td>
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

function openModal(modal) {
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
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

async function refreshAndRender() {
  await loadState();
  renderAll();
}

async function handleBookSubmit(e) {
  e.preventDefault();
  const id = sanitizeDigits(document.querySelector("#bookId")?.value.trim() || "");
  const title = document.querySelector("#bookTitle")?.value.trim() || "";
  const author = document.querySelector("#bookAuthor")?.value.trim() || "";
  const location = document.querySelector("#bookLocation")?.value.trim() || "";
  const genre = document.querySelector("#bookGenre")?.value.trim() || "";
  const publisher = document.querySelector("#bookPublisher")?.value.trim() || "";

  if (!id) return notify("ID do livro deve conter apenas números.");
  try {
    await api("create_book", { id, title, author, location, genre, publisher });
    await refreshAndRender();
    e.target.reset();
    notify("Livro cadastrado com sucesso.");
  } catch (err) {
    notify(err.message);
  }
}

async function handleClientSubmit(e) {
  e.preventDefault();
  const name = document.querySelector("#clientName")?.value.trim() || "";
  const cpf = sanitizeDigits(document.querySelector("#clientCpf")?.value.trim() || "");
  const phone = sanitizeDigits(document.querySelector("#clientPhone")?.value.trim() || "");
  const address = document.querySelector("#clientAddress")?.value.trim() || "";

  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/.test(name)) return notify("Nome do cliente deve conter apenas letras.");
  if (cpf.length !== CPF_DIGITS) return notify("CPF deve ter 11 números.");
  if (phone.length < PHONE_MIN_DIGITS || phone.length > PHONE_MAX_DIGITS) return notify("Telefone deve ter 10 ou 11 números.");

  try {
    await api("create_client", { name, cpf, phone, address });
    await refreshAndRender();
    e.target.reset();
    notify("Cliente cadastrado com sucesso.");
  } catch (err) {
    notify(err.message);
  }
}

async function handleBookEditSubmit(e) {
  e.preventDefault();
  if (!editingBookId) return;
  const id = sanitizeDigits(document.querySelector("#bookEditId")?.value.trim() || "");
  const title = document.querySelector("#bookEditTitle")?.value.trim() || "";
  const author = document.querySelector("#bookEditAuthor")?.value.trim() || "";
  const location = document.querySelector("#bookEditLocation")?.value.trim() || "";
  const genre = document.querySelector("#bookEditGenre")?.value.trim() || "";
  const publisher = document.querySelector("#bookEditPublisher")?.value.trim() || "";
  if (!id) return notify("ID do livro deve conter apenas números.");

  try {
    await api("update_book", { currentId: editingBookId, id, title, author, location, genre, publisher });
    editingBookId = null;
    closeModal(els.bookEditModal);
    await refreshAndRender();
    notify("Livro atualizado com sucesso.");
  } catch (err) {
    notify(err.message);
  }
}

async function handleClientEditSubmit(e) {
  e.preventDefault();
  if (!editingClientId) return;
  const id = document.querySelector("#clientEditId")?.value.trim() || "";
  const name = document.querySelector("#clientEditName")?.value.trim() || "";
  const cpf = sanitizeDigits(document.querySelector("#clientEditCpf")?.value.trim() || "");
  const phone = sanitizeDigits(document.querySelector("#clientEditPhone")?.value.trim() || "");
  const address = document.querySelector("#clientEditAddress")?.value.trim() || "";

  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/.test(name)) return notify("Nome do cliente deve conter apenas letras.");
  if (cpf.length !== CPF_DIGITS) return notify("CPF deve ter 11 números.");
  if (phone.length < PHONE_MIN_DIGITS || phone.length > PHONE_MAX_DIGITS) return notify("Telefone deve ter 10 ou 11 números.");

  try {
    await api("update_client", { id, name, cpf, phone, address });
    editingClientId = null;
    closeModal(els.clientEditModal);
    await refreshAndRender();
    notify("Cliente atualizado com sucesso.");
  } catch (err) {
    notify(err.message);
  }
}

async function handleRentalSubmit(e) {
  e.preventDefault();
  const bookId = els.rentalBook?.value;
  const clientId = els.rentalClient?.value;
  const startDate = els.rentalStart?.value;
  if (!bookId || !clientId || !startDate) return notify("Selecione livro, cliente e data de início.");

  const dueDate = addDays(startDate, RENTAL_LIMIT_DAYS).toISOString().slice(0, 10);
  try {
    await api("create_rental", { bookId, clientId, startDate, dueDate });
    await refreshAndRender();
    e.target.reset();
    if (els.rentalStart) els.rentalStart.value = todayISO();
    notify("Empréstimo registrado por 10 dias.");
  } catch (err) {
    notify(err.message);
  }
}

async function deleteSelectedHistory() {
  const selected = Array.from(document.querySelectorAll(".history-check:checked")).map((el) => Number(el.dataset.historyIndex));
  if (!selected.length) return notify("Selecione itens do histórico para apagar.");
  try {
    await api("delete_history", { indexes: selected });
    await refreshAndRender();
    notify("Itens selecionados do histórico foram apagados.");
  } catch (err) {
    notify(err.message);
  }
}

async function handleTableClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;

  const returnBook = btn.dataset.returnBook;
  const removeBook = btn.dataset.removeBook;
  const removeClient = btn.dataset.removeClient;
  const editBook = btn.dataset.editBook;
  const editClient = btn.dataset.editClient;

  if (editBook) {
    const book = getBookById(editBook);
    if (!book || !els.bookEditModal) return;
    editingBookId = editBook;
    document.querySelector("#bookEditId").value = book.id;
    document.querySelector("#bookEditTitle").value = book.title;
    document.querySelector("#bookEditAuthor").value = book.author;
    document.querySelector("#bookEditLocation").value = book.location || "";
    document.querySelector("#bookEditGenre").value = book.genre || "";
    document.querySelector("#bookEditPublisher").value = book.publisher || "";
    openModal(els.bookEditModal);
    return;
  }

  if (editClient) {
    const client = getClientById(editClient);
    if (!client || !els.clientEditModal) return;
    editingClientId = editClient;
    document.querySelector("#clientEditId").value = client.id;
    document.querySelector("#clientEditName").value = client.name;
    document.querySelector("#clientEditCpf").value = client.cpf;
    document.querySelector("#clientEditPhone").value = client.phone;
    document.querySelector("#clientEditAddress").value = client.address || "";
    openModal(els.clientEditModal);
    return;
  }

  try {
    if (returnBook) {
      await api("return_rental", { bookId: returnBook, returnedDate: todayISO() });
      notify("Livro devolvido e registrado no histórico.");
    }

    if (removeBook) {
      await api("delete_book", { id: removeBook });
      notify("Livro excluído.");
    }

    if (removeClient) {
      await api("delete_client", { id: removeClient });
      notify("Cliente excluído.");
    }

    await refreshAndRender();
  } catch (err) {
    notify(err.message);
  }
}

function bindNumericInput(selector, maxLength) {
  const input = document.querySelector(selector);
  if (!input) return;
  input.addEventListener("input", () => {
    const digitsOnly = sanitizeDigits(input.value);
    input.value = maxLength ? digitsOnly.slice(0, maxLength) : digitsOnly;
  });
}


function bindSearchInput(input) {
  if (!input) return;
  input.addEventListener("input", renderAll);
}

async function init() {
  initTheme();

  if (els.rentalStart) els.rentalStart.value = todayISO();
  if (els.bookForm) els.bookForm.addEventListener("submit", handleBookSubmit);
  if (els.clientForm) els.clientForm.addEventListener("submit", handleClientSubmit);
  if (els.bookEditForm) els.bookEditForm.addEventListener("submit", handleBookEditSubmit);
  if (els.clientEditForm) els.clientEditForm.addEventListener("submit", handleClientEditSubmit);
  if (els.bookEditCancel) els.bookEditCancel.addEventListener("click", () => closeModal(els.bookEditModal));
  if (els.clientEditCancel) els.clientEditCancel.addEventListener("click", () => closeModal(els.clientEditModal));
  if (els.rentalForm) els.rentalForm.addEventListener("submit", handleRentalSubmit);
  if (els.deleteHistoryBtn) els.deleteHistoryBtn.addEventListener("click", deleteSelectedHistory);

  document.body.addEventListener("click", handleTableClick);
  bindNumericInput("#bookId");
  bindNumericInput("#bookEditId");
  bindNumericInput("#clientCpf", CPF_DIGITS);
  bindNumericInput("#clientPhone", PHONE_MAX_DIGITS);
  bindNumericInput("#clientEditCpf", CPF_DIGITS);
  bindNumericInput("#clientEditPhone", PHONE_MAX_DIGITS);
  bindSearchInput(els.booksSearch);
  bindSearchInput(els.clientsSearch);
  bindSearchInput(els.rentalsSearch);

  try {
    await refreshAndRender();
  } catch (err) {
    notify(err.message || "Não foi possível carregar dados do servidor.");
  }
}

init();
