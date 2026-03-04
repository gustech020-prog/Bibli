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

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    if (!is_dir(__DIR__ . '/data')) {
        mkdir(__DIR__ . '/data', 0775, true);
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
            author TEXT NOT NULL
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            cpf TEXT NOT NULL UNIQUE,
            phone TEXT NOT NULL
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

    return $pdo;
}

function findBook(PDO $pdo, string $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, title, author FROM books WHERE id = :id');
    $stmt->execute(['id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function findClient(PDO $pdo, string $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, name, cpf, phone FROM clients WHERE id = :id');
    $stmt->execute(['id' => (int) $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function getState(PDO $pdo): array
{
    $books = $pdo->query('SELECT id, title, author FROM books ORDER BY CAST(id as INTEGER), id')->fetchAll();
    $clients = $pdo->query('SELECT id, name, cpf, phone FROM clients ORDER BY id')->fetchAll();
    $rentals = $pdo->query('SELECT book_id, client_id, start_date, due_date, returned_date, id FROM rentals ORDER BY id')->fetchAll();

    $clients = array_map(static function (array $c): array {
        return [
            'id' => (string) $c['id'],
            'name' => $c['name'],
            'cpf' => $c['cpf'],
            'phone' => $c['phone'],
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

$pdo = db();

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

            if ($id === '') {
                respond(['ok' => false, 'message' => 'ID do livro é obrigatório.'], 400);
            }
            if (findBook($pdo, $id) !== null) {
                respond(['ok' => false, 'message' => 'Já existe um livro com este ID.'], 409);
            }

            $stmt = $pdo->prepare('INSERT INTO books (id, title, author) VALUES (:id, :title, :author)');
            $stmt->execute(['id' => $id, 'title' => $title, 'author' => $author]);
            respond(['ok' => true]);
        }

        case 'update_book': {
            $currentId = (string) ($payload['currentId'] ?? '');
            $id = (string) ($payload['id'] ?? '');
            $title = trim((string) ($payload['title'] ?? ''));
            $author = trim((string) ($payload['author'] ?? ''));

            if (findBook($pdo, $currentId) === null) {
                respond(['ok' => false, 'message' => 'Livro não encontrado.'], 404);
            }
            if ($currentId !== $id && findBook($pdo, $id) !== null) {
                respond(['ok' => false, 'message' => 'Já existe um livro com este ID.'], 409);
            }

            $pdo->beginTransaction();
            $stmt = $pdo->prepare('UPDATE books SET id = :id, title = :title, author = :author WHERE id = :currentId');
            $stmt->execute(['id' => $id, 'title' => $title, 'author' => $author, 'currentId' => $currentId]);
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

            $stmt = $pdo->prepare('SELECT COUNT(*) FROM clients WHERE cpf = :cpf');
            $stmt->execute(['cpf' => $cpf]);
            if ((int) $stmt->fetchColumn() > 0) {
                respond(['ok' => false, 'message' => 'Já existe um cliente com este CPF.'], 409);
            }

            $stmt = $pdo->prepare('INSERT INTO clients (name, cpf, phone) VALUES (:name, :cpf, :phone)');
            $stmt->execute(['name' => $name, 'cpf' => $cpf, 'phone' => $phone]);
            respond(['ok' => true]);
        }

        case 'update_client': {
            $id = (string) ($payload['id'] ?? '');
            $name = trim((string) ($payload['name'] ?? ''));
            $cpf = (string) ($payload['cpf'] ?? '');
            $phone = (string) ($payload['phone'] ?? '');

            if (findClient($pdo, $id) === null) {
                respond(['ok' => false, 'message' => 'Cliente não encontrado.'], 404);
            }

            $stmt = $pdo->prepare('SELECT COUNT(*) FROM clients WHERE cpf = :cpf AND id <> :id');
            $stmt->execute(['cpf' => $cpf, 'id' => (int) $id]);
            if ((int) $stmt->fetchColumn() > 0) {
                respond(['ok' => false, 'message' => 'Já existe um cliente com este CPF.'], 409);
            }

            $stmt = $pdo->prepare('UPDATE clients SET name = :name, cpf = :cpf, phone = :phone WHERE id = :id');
            $stmt->execute(['name' => $name, 'cpf' => $cpf, 'phone' => $phone, 'id' => (int) $id]);
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
    respond(['ok' => false, 'message' => 'Erro interno de servidor.'], 500);
}
