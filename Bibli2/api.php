<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

const STORAGE_FILE = __DIR__ . '/data/storage.json';

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function readStorage(): array
{
    if (!file_exists(STORAGE_FILE)) {
        $initial = [
            'nextClientId' => 1,
            'books' => [],
            'clients' => [],
            'rentals' => [],
        ];
        file_put_contents(STORAGE_FILE, json_encode($initial, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    }

    $raw = file_get_contents(STORAGE_FILE);
    $data = json_decode((string) $raw, true);

    if (!is_array($data)) {
        return ['nextClientId' => 1, 'books' => [], 'clients' => [], 'rentals' => []];
    }

    $data['nextClientId'] = isset($data['nextClientId']) ? (int) $data['nextClientId'] : 1;
    $data['books'] = is_array($data['books'] ?? null) ? $data['books'] : [];
    $data['clients'] = is_array($data['clients'] ?? null) ? $data['clients'] : [];
    $data['rentals'] = is_array($data['rentals'] ?? null) ? $data['rentals'] : [];

    return $data;
}

function writeStorage(array $data): void
{
    $fp = fopen(STORAGE_FILE, 'c+');
    if (!$fp) {
        respond(['ok' => false, 'message' => 'Falha ao abrir armazenamento.'], 500);
    }

    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function findIndexById(array $items, string $id): int
{
    foreach ($items as $idx => $item) {
        if (($item['id'] ?? '') === $id) {
            return $idx;
        }
    }
    return -1;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';
$payload = json_decode(file_get_contents('php://input') ?: '[]', true);
if (!is_array($payload)) {
    $payload = [];
}

$data = readStorage();

if ($method === 'GET' && $action === 'state') {
    respond([
        'ok' => true,
        'state' => [
            'books' => $data['books'],
            'clients' => $data['clients'],
            'rentals' => $data['rentals'],
        ],
    ]);
}

if ($method !== 'POST') {
    respond(['ok' => false, 'message' => 'Método inválido.'], 405);
}

switch ($action) {
    case 'create_book': {
        $book = [
            'id' => (string) ($payload['id'] ?? ''),
            'title' => trim((string) ($payload['title'] ?? '')),
            'author' => trim((string) ($payload['author'] ?? '')),
        ];
        if ($book['id'] === '') {
            respond(['ok' => false, 'message' => 'ID do livro é obrigatório.'], 400);
        }
        if (findIndexById($data['books'], $book['id']) !== -1) {
            respond(['ok' => false, 'message' => 'Já existe um livro com este ID.'], 409);
        }
        $data['books'][] = $book;
        writeStorage($data);
        respond(['ok' => true]);
    }

    case 'update_book': {
        $currentId = (string) ($payload['currentId'] ?? '');
        $newId = (string) ($payload['id'] ?? '');
        $idx = findIndexById($data['books'], $currentId);
        if ($idx === -1) {
            respond(['ok' => false, 'message' => 'Livro não encontrado.'], 404);
        }
        if ($currentId !== $newId && findIndexById($data['books'], $newId) !== -1) {
            respond(['ok' => false, 'message' => 'Já existe um livro com este ID.'], 409);
        }

        $data['books'][$idx] = [
            'id' => $newId,
            'title' => trim((string) ($payload['title'] ?? '')),
            'author' => trim((string) ($payload['author'] ?? '')),
        ];
        foreach ($data['rentals'] as &$rental) {
            if (($rental['bookId'] ?? '') === $currentId) {
                $rental['bookId'] = $newId;
            }
        }
        unset($rental);
        writeStorage($data);
        respond(['ok' => true]);
    }

    case 'delete_book': {
        $id = (string) ($payload['id'] ?? '');
        foreach ($data['rentals'] as $rental) {
            if (($rental['bookId'] ?? '') === $id && empty($rental['returnedDate'])) {
                respond(['ok' => false, 'message' => 'Não é possível excluir um livro emprestado.'], 409);
            }
        }
        $data['books'] = array_values(array_filter($data['books'], static function ($book) use ($id) {
            return ($book['id'] ?? '') !== $id;
        }));
        writeStorage($data);
        respond(['ok' => true]);
    }

    case 'create_client': {
        $newId = (string) $data['nextClientId'];
        $data['nextClientId']++;
        $cpf = (string) ($payload['cpf'] ?? '');
        foreach ($data['clients'] as $client) {
            if (($client['cpf'] ?? '') === $cpf) {
                respond(['ok' => false, 'message' => 'Já existe um cliente com este CPF.'], 409);
            }
        }
        $data['clients'][] = [
            'id' => $newId,
            'name' => trim((string) ($payload['name'] ?? '')),
            'cpf' => $cpf,
            'phone' => (string) ($payload['phone'] ?? ''),
        ];
        writeStorage($data);
        respond(['ok' => true]);
    }

    case 'update_client': {
        $id = (string) ($payload['id'] ?? '');
        $idx = findIndexById($data['clients'], $id);
        if ($idx === -1) {
            respond(['ok' => false, 'message' => 'Cliente não encontrado.'], 404);
        }
        $cpf = (string) ($payload['cpf'] ?? '');
        foreach ($data['clients'] as $otherIdx => $client) {
            if ($otherIdx !== $idx && ($client['cpf'] ?? '') === $cpf) {
                respond(['ok' => false, 'message' => 'Já existe um cliente com este CPF.'], 409);
            }
        }
        $data['clients'][$idx] = [
            'id' => $id,
            'name' => trim((string) ($payload['name'] ?? '')),
            'cpf' => $cpf,
            'phone' => (string) ($payload['phone'] ?? ''),
        ];
        writeStorage($data);
        respond(['ok' => true]);
    }

    case 'delete_client': {
        $id = (string) ($payload['id'] ?? '');
        foreach ($data['rentals'] as $rental) {
            if (($rental['clientId'] ?? '') === $id && empty($rental['returnedDate'])) {
                respond(['ok' => false, 'message' => 'Não é possível excluir cliente com empréstimo ativo.'], 409);
            }
        }
        $data['clients'] = array_values(array_filter($data['clients'], static function ($client) use ($id) {
            return ($client['id'] ?? '') !== $id;
        }));
        writeStorage($data);
        respond(['ok' => true]);
    }

    case 'create_rental': {
        $bookId = (string) ($payload['bookId'] ?? '');
        $clientId = (string) ($payload['clientId'] ?? '');
        foreach ($data['rentals'] as $rental) {
            if (($rental['bookId'] ?? '') === $bookId && empty($rental['returnedDate'])) {
                respond(['ok' => false, 'message' => 'Este livro já está emprestado.'], 409);
            }
        }
        $data['rentals'][] = [
            'bookId' => $bookId,
            'clientId' => $clientId,
            'startDate' => (string) ($payload['startDate'] ?? ''),
            'dueDate' => (string) ($payload['dueDate'] ?? ''),
            'returnedDate' => null,
        ];
        writeStorage($data);
        respond(['ok' => true]);
    }

    case 'return_rental': {
        $bookId = (string) ($payload['bookId'] ?? '');
        foreach ($data['rentals'] as &$rental) {
            if (($rental['bookId'] ?? '') === $bookId && empty($rental['returnedDate'])) {
                $rental['returnedDate'] = (string) ($payload['returnedDate'] ?? date('Y-m-d'));
                break;
            }
        }
        unset($rental);
        writeStorage($data);
        respond(['ok' => true]);
    }

    case 'delete_history': {
        $indexes = $payload['indexes'] ?? [];
        if (!is_array($indexes)) {
            $indexes = [];
        }
        $indexSet = [];
        foreach ($indexes as $idx) {
            $indexSet[(int) $idx] = true;
        }
        $data['rentals'] = array_values(array_filter($data['rentals'], static function ($_value, $idx) use ($indexSet) {
            return !isset($indexSet[$idx]);
        }, ARRAY_FILTER_USE_BOTH));
        writeStorage($data);
        respond(['ok' => true]);
    }

    default:
        respond(['ok' => false, 'message' => 'Ação inválida.'], 400);
}
