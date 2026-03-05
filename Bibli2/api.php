<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

const DB_FILE = __DIR__ . '/data/bibli.db';

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}


function explainInitError(Throwable $e): string
{
    $base = 'Falha ao inicializar banco SQL (SQLite/PDO).';
    if (!extension_loaded('pdo_sqlite')) {
        return $base . ' Ative a extensão pdo_sqlite no php.ini e reinicie o servidor Apache/PHP.';
    }
    $msg = trim($e->getMessage());
    if ($msg !== '') {
        return $base . ' Detalhe: ' . $msg;
    }
    return $base;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dataDir = __DIR__ . '/data';
    if (!is_dir($dataDir) && !mkdir($dataDir, 0775, true) && !is_dir($dataDir)) {
        throw new RuntimeException('Não foi possível criar o diretório de dados: ' . $dataDir);
    }
    if (!is_writable($dataDir)) {
        throw new RuntimeException('Sem permissão de escrita no diretório de dados: ' . $dataDir);
    }
    if (!extension_loaded('pdo_sqlite')) {
        throw new RuntimeException('Extensão pdo_sqlite não está habilitada.');
    }

    $pdo = new PDO('sqlite:' . DB_FILE, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $pdo->exec('PRAGMA journal_mode = WAL;');
    $pdo->exec('PRAGMA foreign_keys = ON;');

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS books (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            location TEXT NOT NULL DEFAULT \'\',
            genre TEXT NOT NULL DEFAULT \'\',
            publisher TEXT NOT NULL DEFAULT \'\'
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            cpf TEXT NOT NULL UNIQUE,
            phone TEXT NOT NULL,
            address TEXT NOT NULL DEFAULT \'\'
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS rentals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id TEXT NOT NULL,
            client_id INTEGER NOT NULL,
            start_date TEXT NOT NULL,
            due_date TEXT NOT NULL,
            returned_date TEXT NULL,
            FOREIGN KEY(book_id) REFERENCES books(id) ON UPDATE CASCADE ON DELETE RESTRICT,
            FOREIGN KEY(client_id) REFERENCES clients(id) ON UPDATE CASCADE ON DELETE RESTRICT
        )'
    );

    ensureColumn($pdo, 'books', 'location', "TEXT NOT NULL DEFAULT ''");
    ensureColumn($pdo, 'books', 'genre', "TEXT NOT NULL DEFAULT ''");
    ensureColumn($pdo, 'books', 'publisher', "TEXT NOT NULL DEFAULT ''");
    ensureColumn($pdo, 'clients', 'address', "TEXT NOT NULL DEFAULT ''");

    return $pdo;
}


function ensureColumn(PDO $pdo, string $table, string $column, string $definition): void
{
    $stmt = $pdo->query("PRAGMA table_info($table)");
    $columns = $stmt ? $stmt->fetchAll() : [];
    foreach ($columns as $col) {
        if (($col['name'] ?? '') === $column) {
            return;
        }
    }
    $pdo->exec("ALTER TABLE $table ADD COLUMN $column $definition");
}

function findBook(PDO $pdo, string $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, title, author, location, genre, publisher FROM books WHERE id = :id');
    $stmt->execute(['id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function findClient(PDO $pdo, string $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, name, cpf, phone, address FROM clients WHERE id = :id');
    $stmt->execute(['id' => (int) $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function getState(PDO $pdo): array
{
    $books = $pdo->query('SELECT id, title, author, location, genre, publisher FROM books ORDER BY CAST(id as INTEGER), id')->fetchAll();
    $clients = $pdo->query('SELECT id, name, cpf, phone, address FROM clients ORDER BY id')->fetchAll();
    $rentals = $pdo->query('SELECT book_id, client_id, start_date, due_date, returned_date, id FROM rentals ORDER BY id')->fetchAll();

    $clients = array_map(static function (array $c): array {
        return [
            'id' => (string) $c['id'],
            'name' => $c['name'],
            'cpf' => $c['cpf'],
            'phone' => $c['phone'],
            'address' => $c['address'] ?? '',
        ];
    }, $clients);

    $rentals = array_map(static function (array $r): array {
        return [
            'bookId' => (string) $r['book_id'],
            'clientId' => (string) $r['client_id'],
            'startDate' => $r['start_date'],
            'dueDate' => $r['due_date'],
            'returnedDate' => $r['returned_date'] !== null ? $r['returned_date'] : null,
            '_id' => (int) $r['id'],
        ];
    }, $rentals);

    return [
        'books' => $books,
        'clients' => $clients,
        'rentals' => $rentals,
    ];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';
$payload = json_decode(file_get_contents('php://input') ?: '[]', true);
if (!is_array($payload)) {
    $payload = [];
}

try {
    $pdo = db();
} catch (Throwable $e) {
    respond(['ok' => false, 'message' => explainInitError($e)], 500);
}

if ($method === 'GET' && $action === 'state') {
    respond(['ok' => true, 'state' => getState($pdo)]);
}

if ($method !== 'POST') {
    respond(['ok' => false, 'message' => 'Método inválido.'], 405);
}

try {
    switch ($action) {
        case 'create_book': {
            $id = (string) ($payload['id'] ?? '');
            $title = trim((string) ($payload['title'] ?? ''));
            $author = trim((string) ($payload['author'] ?? ''));
            $location = trim((string) ($payload['location'] ?? ''));
            $genre = trim((string) ($payload['genre'] ?? ''));
            $publisher = trim((string) ($payload['publisher'] ?? ''));

            if ($id === '') {
                respond(['ok' => false, 'message' => 'ID do livro é obrigatório.'], 400);
            }
            if (findBook($pdo, $id) !== null) {
                respond(['ok' => false, 'message' => 'Já existe um livro com este ID.'], 409);
            }

            $stmt = $pdo->prepare('INSERT INTO books (id, title, author, location, genre, publisher) VALUES (:id, :title, :author, :location, :genre, :publisher)');
            $stmt->execute(['id' => $id, 'title' => $title, 'author' => $author, 'location' => $location, 'genre' => $genre, 'publisher' => $publisher]);
            respond(['ok' => true]);
        }

        case 'update_book': {
            $currentId = (string) ($payload['currentId'] ?? '');
            $id = (string) ($payload['id'] ?? '');
            $title = trim((string) ($payload['title'] ?? ''));
            $author = trim((string) ($payload['author'] ?? ''));
            $location = trim((string) ($payload['location'] ?? ''));
            $genre = trim((string) ($payload['genre'] ?? ''));
            $publisher = trim((string) ($payload['publisher'] ?? ''));

            if (findBook($pdo, $currentId) === null) {
                respond(['ok' => false, 'message' => 'Livro não encontrado.'], 404);
            }
            if ($currentId !== $id && findBook($pdo, $id) !== null) {
                respond(['ok' => false, 'message' => 'Já existe um livro com este ID.'], 409);
            }

            $pdo->beginTransaction();
            $stmt = $pdo->prepare('UPDATE books SET id = :id, title = :title, author = :author, location = :location, genre = :genre, publisher = :publisher WHERE id = :currentId');
            $stmt->execute(['id' => $id, 'title' => $title, 'author' => $author, 'location' => $location, 'genre' => $genre, 'publisher' => $publisher, 'currentId' => $currentId]);
            $stmt = $pdo->prepare('UPDATE rentals SET book_id = :newId WHERE book_id = :currentId');
            $stmt->execute(['newId' => $id, 'currentId' => $currentId]);
            $pdo->commit();
            respond(['ok' => true]);
        }

        case 'delete_book': {
            $id = (string) ($payload['id'] ?? '');
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM rentals WHERE book_id = :id AND returned_date IS NULL');
            $stmt->execute(['id' => $id]);
            if ((int) $stmt->fetchColumn() > 0) {
                respond(['ok' => false, 'message' => 'Não é possível excluir um livro emprestado.'], 409);
            }
            $stmt = $pdo->prepare('DELETE FROM books WHERE id = :id');
            $stmt->execute(['id' => $id]);
            respond(['ok' => true]);
        }

        case 'create_client': {
            $name = trim((string) ($payload['name'] ?? ''));
            $cpf = (string) ($payload['cpf'] ?? '');
            $phone = (string) ($payload['phone'] ?? '');
            $address = trim((string) ($payload['address'] ?? ''));

            $stmt = $pdo->prepare('SELECT COUNT(*) FROM clients WHERE cpf = :cpf');
            $stmt->execute(['cpf' => $cpf]);
            if ((int) $stmt->fetchColumn() > 0) {
                respond(['ok' => false, 'message' => 'Já existe um cliente com este CPF.'], 409);
            }

            $stmt = $pdo->prepare('INSERT INTO clients (name, cpf, phone, address) VALUES (:name, :cpf, :phone, :address)');
            $stmt->execute(['name' => $name, 'cpf' => $cpf, 'phone' => $phone, 'address' => $address]);
            respond(['ok' => true]);
        }

        case 'update_client': {
            $id = (string) ($payload['id'] ?? '');
            $name = trim((string) ($payload['name'] ?? ''));
            $cpf = (string) ($payload['cpf'] ?? '');
            $phone = (string) ($payload['phone'] ?? '');
            $address = trim((string) ($payload['address'] ?? ''));

            if (findClient($pdo, $id) === null) {
                respond(['ok' => false, 'message' => 'Cliente não encontrado.'], 404);
            }

            $stmt = $pdo->prepare('SELECT COUNT(*) FROM clients WHERE cpf = :cpf AND id <> :id');
            $stmt->execute(['cpf' => $cpf, 'id' => (int) $id]);
            if ((int) $stmt->fetchColumn() > 0) {
                respond(['ok' => false, 'message' => 'Já existe um cliente com este CPF.'], 409);
            }

            $stmt = $pdo->prepare('UPDATE clients SET name = :name, cpf = :cpf, phone = :phone, address = :address WHERE id = :id');
            $stmt->execute(['name' => $name, 'cpf' => $cpf, 'phone' => $phone, 'address' => $address, 'id' => (int) $id]);
            respond(['ok' => true]);
        }

        case 'delete_client': {
            $id = (string) ($payload['id'] ?? '');
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM rentals WHERE client_id = :id AND returned_date IS NULL');
            $stmt->execute(['id' => (int) $id]);
            if ((int) $stmt->fetchColumn() > 0) {
                respond(['ok' => false, 'message' => 'Não é possível excluir cliente com empréstimo ativo.'], 409);
            }
            $stmt = $pdo->prepare('DELETE FROM clients WHERE id = :id');
            $stmt->execute(['id' => (int) $id]);
            respond(['ok' => true]);
        }

        case 'create_rental': {
            $bookId = (string) ($payload['bookId'] ?? '');
            $clientId = (string) ($payload['clientId'] ?? '');
            $startDate = (string) ($payload['startDate'] ?? '');
            $dueDate = (string) ($payload['dueDate'] ?? '');

            if (findBook($pdo, $bookId) === null) {
                respond(['ok' => false, 'message' => 'Livro selecionado é inválido.'], 409);
            }
            if (findClient($pdo, $clientId) === null) {
                respond(['ok' => false, 'message' => 'Cliente selecionado é inválido.'], 409);
            }

            $stmt = $pdo->prepare('SELECT COUNT(*) FROM rentals WHERE book_id = :book AND returned_date IS NULL');
            $stmt->execute(['book' => $bookId]);
            if ((int) $stmt->fetchColumn() > 0) {
                respond(['ok' => false, 'message' => 'Este livro já está emprestado.'], 409);
            }

            $stmt = $pdo->prepare('INSERT INTO rentals (book_id, client_id, start_date, due_date, returned_date) VALUES (:book, :client, :start, :due, NULL)');
            $stmt->execute(['book' => $bookId, 'client' => (int) $clientId, 'start' => $startDate, 'due' => $dueDate]);
            respond(['ok' => true]);
        }

        case 'return_rental': {
            $bookId = (string) ($payload['bookId'] ?? '');
            $returnedDate = (string) ($payload['returnedDate'] ?? date('Y-m-d'));
            $stmt = $pdo->prepare('UPDATE rentals SET returned_date = :returnedDate WHERE id = (
                SELECT id FROM rentals WHERE book_id = :bookId AND returned_date IS NULL ORDER BY id LIMIT 1
            )');
            $stmt->execute(['returnedDate' => $returnedDate, 'bookId' => $bookId]);
            respond(['ok' => true]);
        }

        case 'delete_history': {
            $indexes = $payload['indexes'] ?? [];
            if (!is_array($indexes) || !$indexes) {
                respond(['ok' => false, 'message' => 'Nenhum item selecionado.'], 400);
            }

            $rows = $pdo->query('SELECT id FROM rentals ORDER BY id')->fetchAll();
            $idsToDelete = [];
            foreach ($indexes as $idx) {
                $i = (int) $idx;
                if (isset($rows[$i]['id'])) {
                    $idsToDelete[] = (int) $rows[$i]['id'];
                }
            }

            if (!$idsToDelete) {
                respond(['ok' => true]);
            }

            $in = implode(',', array_fill(0, count($idsToDelete), '?'));
            $stmt = $pdo->prepare("DELETE FROM rentals WHERE id IN ($in)");
            $stmt->execute($idsToDelete);
            respond(['ok' => true]);
        }

        default:
            respond(['ok' => false, 'message' => 'Ação inválida.'], 400);
    }
} catch (Throwable $e) {
    $msg = trim($e->getMessage());
    respond(['ok' => false, 'message' => $msg !== '' ? $msg : 'Erro interno de servidor.'], 500);
}
