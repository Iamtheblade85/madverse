<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

define('DB_FILE', __DIR__ . '/finanze_personali.db');

function db()
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO('sqlite:' . DB_FILE);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    }
    return $pdo;
}

function h($s)
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function init_db()
{
    $pdo = db();
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'EUR',
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            initial_balance REAL NOT NULL DEFAULT 0
        );
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
            parent_id INTEGER,
            FOREIGN KEY(parent_id) REFERENCES categories(id)
        );
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            direction TEXT NOT NULL CHECK(direction IN ('in','out')),
            category_id INTEGER,
            description TEXT,
            is_private INTEGER NOT NULL DEFAULT 0,
            freq TEXT NOT NULL DEFAULT 'once',
            income_kind TEXT,
            FOREIGN KEY(account_id) REFERENCES accounts(id),
            FOREIGN KEY(category_id) REFERENCES categories(id)
        );
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            period_type TEXT NOT NULL CHECK(period_type IN ('monthly','yearly')),
            amount REAL NOT NULL,
            start_date TEXT,
            FOREIGN KEY(category_id) REFERENCES categories(id)
        );
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            target_amount REAL NOT NULL,
            deadline TEXT,
            account_id INTEGER,
            description TEXT,
            FOREIGN KEY(account_id) REFERENCES accounts(id)
        );
    ");
    $cols = $pdo->query("PRAGMA table_info(accounts)")->fetchAll(PDO::FETCH_ASSOC);
    $names = array_map(function ($r) {
        return $r['name'];
    }, $cols);
    if (!in_array('initial_balance', $names, true)) {
        $pdo->exec("ALTER TABLE accounts ADD COLUMN initial_balance REAL NOT NULL DEFAULT 0");
    }
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id)");
}

function parse_date($text)
{
    $dt = DateTime::createFromFormat('Y-m-d', $text);
    if ($dt === false) {
        return null;
    }
    return $dt;
}

function safe_date($text, $default_today = true)
{
    $text = trim((string)$text);
    if ($text === '') {
        return $default_today ? new DateTime() : null;
    }
    $dt = parse_date($text);
    if ($dt === null) {
        return $default_today ? new DateTime() : null;
    }
    return $dt;
}

function get_accounts($active_only = true)
{
    $pdo = db();
    if ($active_only) {
        $st = $pdo->query("SELECT id,name,type,currency,description,is_active,initial_balance FROM accounts WHERE is_active=1 ORDER BY name");
    } else {
        $st = $pdo->query("SELECT id,name,type,currency,description,is_active,initial_balance FROM accounts ORDER BY is_active DESC,name");
    }
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function get_account_by_id($id)
{
    $pdo = db();
    $st = $pdo->prepare("SELECT * FROM accounts WHERE id=?");
    $st->execute([$id]);
    return $st->fetch(PDO::FETCH_ASSOC);
}

function get_categories()
{
    $pdo = db();
    $st = $pdo->query("SELECT id,name,type,parent_id FROM categories ORDER BY type,name");
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function get_category_by_id($id)
{
    $pdo = db();
    $st = $pdo->prepare("SELECT * FROM categories WHERE id=?");
    $st->execute([$id]);
    return $st->fetch(PDO::FETCH_ASSOC);
}

function get_budgets()
{
    $pdo = db();
    $st = $pdo->query("
        SELECT b.id,b.category_id,c.name AS category_name,c.type AS category_type,b.period_type,b.amount,b.start_date
        FROM budgets b
        JOIN categories c ON b.category_id=c.id
        ORDER BY c.type,c.name
    ");
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function get_budget_by_id($id)
{
    $pdo = db();
    $st = $pdo->prepare("SELECT * FROM budgets WHERE id=?");
    $st->execute([$id]);
    return $st->fetch(PDO::FETCH_ASSOC);
}

function get_goals()
{
    $pdo = db();
    $st = $pdo->query("
        SELECT g.id,g.name,g.target_amount,g.deadline,g.account_id,g.description,a.name AS account_name
        FROM goals g
        LEFT JOIN accounts a ON g.account_id=a.id
        ORDER BY g.deadline IS NULL,g.deadline,g.name
    ");
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function get_goal_by_id($id)
{
    $pdo = db();
    $st = $pdo->prepare("SELECT * FROM goals WHERE id=?");
    $st->execute([$id]);
    return $st->fetch(PDO::FETCH_ASSOC);
}

function compute_balances($include_private = true)
{
    $pdo = db();
    $sql = "
        SELECT a.id,a.name,a.currency,
               a.initial_balance + COALESCE(SUM(CASE WHEN t.direction='in' THEN t.amount ELSE -t.amount END),0) AS balance
        FROM accounts a
        LEFT JOIN transactions t ON t.account_id=a.id
    ";
    if (!$include_private) {
        $sql .= " AND t.is_private=0";
    }
    $sql .= " GROUP BY a.id,a.name,a.currency,a.initial_balance ORDER BY a.name";
    $st = $pdo->query($sql);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function compute_global_balance($include_private = true)
{
    $rows = compute_balances($include_private);
    $sum = 0.0;
    foreach ($rows as $r) {
        $sum += (float)$r['balance'];
    }
    return $sum;
}

function compute_period_summary(DateTime $start, DateTime $end, $include_private = true)
{
    $pdo = db();
    $where_priv = $include_private ? "" : " AND is_private=0";
    $st = $pdo->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE 0 END),0) AS tot_in,
            COALESCE(SUM(CASE WHEN direction='out' THEN amount ELSE 0 END),0) AS tot_out
        FROM transactions
        WHERE date BETWEEN ? AND ? $where_priv
    ");
    $st->execute([$start->format('Y-m-d'), $end->format('Y-m-d')]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    $tot_in = (float)$row['tot_in'];
    $tot_out = (float)$row['tot_out'];
    $spread = $tot_in - $tot_out;
    $days = (int)$end->diff($start)->format('%a') + 1;
    $avg_in = $days > 0 ? $tot_in / $days : 0.0;
    $avg_out = $days > 0 ? $tot_out / $days : 0.0;
    return [$tot_in, $tot_out, $spread, $avg_in, $avg_out];
}

function compute_category_totals(DateTime $start, DateTime $end, $include_private = true, $direction_filter = null)
{
    $pdo = db();
    $where = "WHERE t.date BETWEEN ? AND ?";
    $params = [$start->format('Y-m-d'), $end->format('Y-m-d')];
    if (!$include_private) {
        $where .= " AND t.is_private=0";
    }
    if ($direction_filter === 'in' || $direction_filter === 'out') {
        $where .= " AND t.direction=?";
        $params[] = $direction_filter;
    }
    $sql = "
        SELECT COALESCE(c.name,'(Senza categoria)') AS cat,
               SUM(CASE WHEN t.direction='in' THEN t.amount ELSE -t.amount END) AS net,
               SUM(CASE WHEN t.direction='in' THEN t.amount ELSE 0 END) AS tot_in,
               SUM(CASE WHEN t.direction='out' THEN t.amount ELSE 0 END) AS tot_out
        FROM transactions t
        LEFT JOIN categories c ON t.category_id=c.id
        $where
        GROUP BY c.name
        ORDER BY net DESC
    ";
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function get_recurring_transactions($include_private = true)
{
    $pdo = db();
    $where = "WHERE freq<>'once'";
    if (!$include_private) {
        $where .= " AND is_private=0";
    }
    $st = $pdo->query("
        SELECT date,amount,direction,freq
        FROM transactions
        $where
    ");
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function net_monthly_from_recurring($include_private = true)
{
    $recs = get_recurring_transactions($include_private);
    $total_in = 0.0;
    $total_out = 0.0;
    foreach ($recs as $r) {
        $amount = (float)$r['amount'];
        $freq = $r['freq'];
        if ($freq === 'daily') {
            $factor = 30.0;
        } elseif ($freq === 'weekly') {
            $factor = 4.345;
        } elseif ($freq === 'monthly') {
            $factor = 1.0;
        } elseif ($freq === 'yearly') {
            $factor = 1.0 / 12.0;
        } else {
            $factor = 0.0;
        }
        $eff = $amount * $factor;
        if ($r['direction'] === 'in') {
            $total_in += $eff;
        } else {
            $total_out += $eff;
        }
    }
    return [$total_in, $total_out];
}

function add_months(DateTime $d, $months)
{
    $clone = clone $d;
    $clone->modify('first day of this month');
    $clone->modify('+' . (int)$months . ' month');
    return $clone;
}

function forecast_months($months, $include_private = true)
{
    $base = compute_global_balance($include_private);
    list($monthly_in, $monthly_out) = net_monthly_from_recurring($include_private);
    $net = $monthly_in - $monthly_out;
    $today = new DateTime();
    $first_month = new DateTime($today->format('Y-m-01'));
    $result = [];
    $balance = $base;
    for ($i = 0; $i < $months; $i++) {
        $balance += $net;
        $m_date = add_months($first_month, $i + 1);
        $result[] = [
            'month' => $m_date->format('Y-m'),
            'balance' => $balance,
            'net' => $net
        ];
    }
    return [$base, $result, $monthly_in, $monthly_out];
}

function get_last_transaction()
{
    $pdo = db();
    $st = $pdo->query("
        SELECT id,account_id,date,amount,direction,category_id,description,is_private,freq,income_kind
        FROM transactions
        ORDER BY date DESC,id DESC
        LIMIT 1
    ");
    return $st->fetch(PDO::FETCH_ASSOC);
}

function compute_budget_status($period_type, DateTime $ref_date = null)
{
    if ($ref_date === null) {
        $ref_date = new DateTime();
    }
    if ($period_type === 'monthly') {
        $start = new DateTime($ref_date->format('Y-m-01'));
        $end = clone $start;
        $end->modify('+1 month')->modify('-1 day');
    } else {
        $start = new DateTime($ref_date->format('Y-01-01'));
        $end = new DateTime($ref_date->format('Y-12-31'));
    }
    $budgets = get_budgets();
    $pdo = db();
    $results = [];
    foreach ($budgets as $b) {
        if ($b['period_type'] !== $period_type) {
            continue;
        }
        $cat_id = $b['category_id'];
        $cat_name = $b['category_name'];
        $cat_type = $b['category_type'];
        if ($cat_type === 'expense') {
            $st = $pdo->prepare("
                SELECT COALESCE(SUM(amount),0) AS used
                FROM transactions
                WHERE category_id=? AND direction='out' AND date BETWEEN ? AND ?
            ");
        } else {
            $st = $pdo->prepare("
                SELECT COALESCE(SUM(amount),0) AS used
                FROM transactions
                WHERE category_id=? AND direction='in' AND date BETWEEN ? AND ?
            ");
        }
        $st->execute([$cat_id, $start->format('Y-m-d'), $end->format('Y-m-d')]);
        $used = (float)$st->fetchColumn();
        $amount = (float)$b['amount'];
        if ($cat_type === 'expense') {
            $diff = $amount - $used;
            $status = $used <= $amount ? 'OK' : 'SFONDATO';
        } else {
            $diff = $used - $amount;
            $status = $used >= $amount ? 'OK' : 'SOTTO OBIETTIVO';
        }
        $results[] = [
            'category_name' => $cat_name,
            'category_type' => $cat_type,
            'period_type' => $period_type,
            'amount' => $amount,
            'used' => $used,
            'diff' => $diff,
            'status' => $status
        ];
    }
    return [$start, $end, $results];
}

function compute_goals_status()
{
    $goals = get_goals();
    $balances = compute_balances(true);
    $bal_by_id = [];
    foreach ($balances as $r) {
        $bal_by_id[$r['id']] = (float)$r['balance'];
    }
    $global_balance = 0.0;
    foreach ($bal_by_id as $v) {
        $global_balance += $v;
    }
    $results = [];
    foreach ($goals as $g) {
        $target = (float)$g['target_amount'];
        $acc_id = $g['account_id'];
        if ($acc_id) {
            $progress = isset($bal_by_id[$acc_id]) ? $bal_by_id[$acc_id] : 0.0;
        } else {
            $progress = $global_balance;
        }
        $remaining = $target - $progress;
        $status = $remaining <= 0 ? 'RAGGIUNTO' : 'DA RAGGIUNGERE';
        $results[] = [
            'id' => $g['id'],
            'name' => $g['name'],
            'target' => $target,
            'deadline' => $g['deadline'],
            'account_name' => $g['account_name'],
            'progress' => $progress,
            'remaining' => $remaining,
            'status' => $status
        ];
    }
    return $results;
}

function analyze_health($include_private = true)
{
    $today = new DateTime();
    $start_30 = (clone $today)->modify('-29 days');
    $start_90 = (clone $today)->modify('-89 days');
    list($tot_in_30, $tot_out_30, $spread_30, $avg_in_30, $avg_out_30) = compute_period_summary($start_30, $today, $include_private);
    list($tot_in_90, $tot_out_90, $spread_90) = compute_period_summary($start_90, $today, $include_private);
    $total_balance = compute_global_balance($include_private);
    list($monthly_in_rec, $monthly_out_rec) = net_monthly_from_recurring($include_private);
    $net_rec = $monthly_in_rec - $monthly_out_rec;
    $savings_rate_30 = $tot_in_30 > 0 ? ($spread_30 / $tot_in_30) * 100.0 : 0.0;
    if ($spread_90 > 0) {
        $status = 'SANO';
    } elseif ($tot_out_90 > 0 && $spread_90 > -0.05 * $tot_out_90) {
        $status = 'LEGGERA PRESSIONE';
    } else {
        $status = 'CRITICO';
    }
    $runway = null;
    if ($net_rec < 0) {
        $net_monthly = $net_rec;
        if ($net_monthly !== 0.0) {
            $runway = $total_balance / abs($net_monthly);
        }
    }
    $start_month = new DateTime($today->format('Y-m-01'));
    $end_month = (clone $start_month)->modify('+1 month')->modify('-1 day');
    list($tot_in_m, $tot_out_m, $spread_m) = compute_period_summary($start_month, $today, $include_private);
    $remaining_days = (int)$end_month->diff($today)->format('%a');
    $safe_daily = null;
    if ($remaining_days > 0) {
        $target_spread = 0.0;
        $remaining_spend = max(0.0, $tot_in_m - $tot_out_m - $target_spread);
        $safe_daily = $remaining_spend / $remaining_days;
    }
    $start_60 = (clone $today)->modify('-59 days');
    $rows_cat = compute_category_totals($start_60, $today, $include_private, 'out');
    $top_cats = array_slice($rows_cat, 0, 3);
    $lines = [];
    $lines[] = "Stato complessivo: " . $status;
    $lines[] = "";
    $lines[] = "Saldo totale (incl. saldi iniziali): " . number_format($total_balance, 2, ',', '.');
    $lines[] = "";
    $lines[] = "Ultimi 30 giorni:";
    $lines[] = "- Entrate: " . number_format($tot_in_30, 2, ',', '.');
    $lines[] = "- Uscite: " . number_format($tot_out_30, 2, ',', '.');
    $lines[] = "- Spread: " . number_format($spread_30, 2, ',', '.');
    $lines[] = "- Tasso di risparmio: " . number_format($savings_rate_30, 1, ',', '.') . "%";
    $lines[] = "";
    $lines[] = "Ultimi 90 giorni:";
    $lines[] = "- Entrate: " . number_format($tot_in_90, 2, ',', '.');
    $lines[] = "- Uscite: " . number_format($tot_out_90, 2, ',', '.');
    $lines[] = "- Spread: " . number_format($spread_90, 2, ',', '.');
    $lines[] = "";
    $lines[] = "Ricorrenti stimati (mese tipo):";
    $lines[] = "- Entrate ricorrenti: " . number_format($monthly_in_rec, 2, ',', '.');
    $lines[] = "- Uscite ricorrenti: " . number_format($monthly_out_rec, 2, ',', '.');
    $lines[] = "- Netto mensile ricorrente: " . number_format($net_rec, 2, ',', '.');
    if ($runway !== null) {
        $lines[] = "- Runway stimata: " . number_format($runway, 1, ',', '.') . " mesi prima di azzerare il saldo se nulla cambia";
    }
    $lines[] = "";
    $lines[] = "Categorie principali (ultimi 60 giorni, uscite):";
    if (empty($top_cats)) {
        $lines[] = "- Nessuna uscita registrata.";
    } else {
        foreach ($top_cats as $r) {
            $lines[] = "- " . $r['cat'] . ": " . number_format($r['tot_out'], 2, ',', '.');
        }
    }
    $lines[] = "";
    if ($safe_daily !== null) {
        $lines[] = "Per chiudere il mese in pareggio, puoi spendere ancora circa " . number_format($safe_daily, 2, ',', '.') . " al giorno.";
    } else {
        $lines[] = "Il mese è quasi terminato: non ha senso calcolare un limite giornaliero.";
    }
    return implode("\n", $lines);
}

function compute_safe_daily_spend_text($include_private = true)
{
    $today = new DateTime();
    $start_month = new DateTime($today->format('Y-m-01'));
    $end_month = (clone $start_month)->modify('+1 month')->modify('-1 day');
    list($tot_in, $tot_out, $spread) = compute_period_summary($start_month, $today, $include_private);
    $remaining_days = (int)$end_month->diff($today)->format('%a');
    if ($remaining_days <= 0) {
        return "Il mese è praticamente finito, non ha senso calcolare un limite giornaliero.";
    }
    $remaining_spend = max(0.0, $tot_in - $tot_out);
    $safe_daily = $remaining_spend / $remaining_days;
    return "Da oggi a fine mese puoi spendere in media circa " . number_format($safe_daily, 2, ',', '.') . " al giorno, se vuoi chiudere il mese intorno al pareggio rispetto alle entrate registrate finora.";
}

function forecast_short_text($months = 3, $include_private = true)
{
    list($base, $result, $minc, $mout) = forecast_months($months, $include_private);
    if (empty($result)) {
        return "Non ci sono dati sufficienti per una previsione.";
    }
    $lines = [];
    $lines[] = "Saldo attuale stimato: " . number_format($base, 2, ',', '.');
    $lines[] = "Netto mensile ricorrente stimato: " . number_format($minc - $mout, 2, ',', '.');
    $lines[] = "";
    $lines[] = "Previsione prossimi " . $months . " mesi (solo ricorrenti):";
    foreach ($result as $r) {
        $lines[] = "- " . $r['month'] . ": saldo stimato " . number_format($r['balance'], 2, ',', '.') . " (netto mese " . number_format($r['net'], 2, ',', '.') . ")";
    }
    return implode("\n", $lines);
}

init_db();

$page = isset($_GET['page']) ? $_GET['page'] : 'dashboard';
$action = isset($_POST['action']) ? $_POST['action'] : null;
$message = '';

if ($action === 'save_account') {
    $id = isset($_POST['account_id']) ? (int)$_POST['account_id'] : 0;
    $name = trim($_POST['name']);
    $type = trim($_POST['type']);
    $currency = trim($_POST['currency']);
    $description = trim($_POST['description']);
    $is_active = isset($_POST['is_active']) ? 1 : 0;
    $init = str_replace(',', '.', $_POST['initial_balance']);
    if ($name !== '' && $type !== '' && $currency !== '') {
        $pdo = db();
        if ($id > 0) {
            $st = $pdo->prepare("UPDATE accounts SET name=?,type=?,currency=?,description=?,is_active=?,initial_balance=? WHERE id=?");
            $st->execute([$name, $type, $currency, $description === '' ? null : $description, $is_active, (float)$init, $id]);
        } else {
            $st = $pdo->prepare("INSERT INTO accounts(name,type,currency,description,is_active,initial_balance) VALUES(?,?,?,?,?,?)");
            $st->execute([$name, $type, $currency, $description === '' ? null : $description, $is_active, (float)$init]);
        }
        $message = 'Conto salvato.';
    }
}

if ($action === 'delete_account') {
    $id = (int)$_POST['account_id'];
    if ($id > 0) {
        $pdo = db();
        try {
            $st = $pdo->prepare("DELETE FROM accounts WHERE id=?");
            $st->execute([$id]);
            $message = 'Conto eliminato.';
        } catch (Exception $e) {
            $message = 'Impossibile eliminare il conto (forse esistono transazioni collegate).';
        }
    }
}

if ($action === 'save_category') {
    $id = isset($_POST['category_id']) ? (int)$_POST['category_id'] : 0;
    $name = trim($_POST['name']);
    $type = trim($_POST['type']);
    $parent = trim($_POST['parent']);
    $parent_id = $parent === '' ? null : (int)$parent;
    if ($name !== '' && in_array($type, ['income', 'expense', 'transfer'], true)) {
        $pdo = db();
        if ($id > 0) {
            $st = $pdo->prepare("UPDATE categories SET name=?,type=?,parent_id=? WHERE id=?");
            $st->execute([$name, $type, $parent_id, $id]);
        } else {
            $st = $pdo->prepare("INSERT INTO categories(name,type,parent_id) VALUES(?,?,?)");
            $st->execute([$name, $type, $parent_id]);
        }
        $message = 'Categoria salvata.';
    }
}

if ($action === 'delete_category') {
    $id = (int)$_POST['category_id'];
    if ($id > 0) {
        $pdo = db();
        try {
            $st = $pdo->prepare("DELETE FROM categories WHERE id=?");
            $st->execute([$id]);
            $message = 'Categoria eliminata.';
        } catch (Exception $e) {
            $message = 'Impossibile eliminare la categoria (forse esistono transazioni collegate).';
        }
    }
}

if ($action === 'save_transaction') {
    $id = isset($_POST['tx_id']) ? (int)$_POST['tx_id'] : 0;
    $date = safe_date($_POST['date']);
    $account = (int)$_POST['account_id'];
    $amount = (float)str_replace(',', '.', $_POST['amount']);
    $direction = $_POST['direction'] === 'in' ? 'in' : 'out';
    $cat_txt = trim($_POST['category_id']);
    $category_id = $cat_txt === '' ? null : (int)$cat_txt;
    $description = trim($_POST['description']);
    $is_private = isset($_POST['is_private']) ? 1 : 0;
    $freq = $_POST['freq'];
    if (!in_array($freq, ['once', 'daily', 'weekly', 'monthly', 'yearly'], true)) {
        $freq = 'once';
    }
    $income_kind = trim($_POST['income_kind']);
    if ($direction === 'out') {
        $income_kind = null;
    } else {
        if (!in_array($income_kind, ['fixed', 'variable', 'one-off'], true)) {
            $income_kind = 'variable';
        }
    }
    if ($account > 0 && $amount !== 0.0) {
        $pdo = db();
        if ($id > 0) {
            $st = $pdo->prepare("
                UPDATE transactions
                SET account_id=?,date=?,amount=?,direction=?,category_id=?,description=?,is_private=?,freq=?,income_kind=?
                WHERE id=?
            ");
            $st->execute([
                $account,
                $date->format('Y-m-d'),
                $amount,
                $direction,
                $category_id,
                $description === '' ? null : $description,
                $is_private,
                $freq,
                $income_kind,
                $id
            ]);
        } else {
            $st = $pdo->prepare("
                INSERT INTO transactions(account_id,date,amount,direction,category_id,description,is_private,freq,income_kind)
                VALUES(?,?,?,?,?,?,?,?,?)
            ");
            $st->execute([
                $account,
                $date->format('Y-m-d'),
                $amount,
                $direction,
                $category_id,
                $description === '' ? null : $description,
                $is_private,
                $freq,
                $income_kind
            ]);
        }
        $message = 'Transazione salvata.';
    }
}

if ($action === 'delete_transaction') {
    $id = (int)$_POST['tx_id'];
    if ($id > 0) {
        $pdo = db();
        $st = $pdo->prepare("DELETE FROM transactions WHERE id=?");
        $st->execute([$id]);
        $message = 'Transazione eliminata.';
    }
}

if ($action === 'save_budget') {
    $id = isset($_POST['budget_id']) ? (int)$_POST['budget_id'] : 0;
    $cat_txt = trim($_POST['category_id']);
    $category_id = $cat_txt === '' ? 0 : (int)$cat_txt;
    $period_type = $_POST['period_type'];
    $amount = (float)str_replace(',', '.', $_POST['amount']);
    $start_date_txt = trim($_POST['start_date']);
    $start_date = $start_date_txt === '' ? null : safe_date($start_date_txt)->format('Y-m-d');
    if ($category_id > 0 && in_array($period_type, ['monthly', 'yearly'], true)) {
        $pdo = db();
        if ($id > 0) {
            $st = $pdo->prepare("UPDATE budgets SET category_id=?,period_type=?,amount=?,start_date=? WHERE id=?");
            $st->execute([$category_id, $period_type, $amount, $start_date, $id]);
        } else {
            $st = $pdo->prepare("INSERT INTO budgets(category_id,period_type,amount,start_date) VALUES(?,?,?,?)");
            $st->execute([$category_id, $period_type, $amount, $start_date]);
        }
        $message = 'Budget salvato.';
    }
}

if ($action === 'delete_budget') {
    $id = (int)$_POST['budget_id'];
    if ($id > 0) {
        $pdo = db();
        $st = $pdo->prepare("DELETE FROM budgets WHERE id=?");
        $st->execute([$id]);
        $message = 'Budget eliminato.';
    }
}

if ($action === 'save_goal') {
    $id = isset($_POST['goal_id']) ? (int)$_POST['goal_id'] : 0;
    $name = trim($_POST['name']);
    $target = (float)str_replace(',', '.', $_POST['target_amount']);
    $deadline_txt = trim($_POST['deadline']);
    $deadline = $deadline_txt === '' ? null : safe_date($deadline_txt)->format('Y-m-d');
    $acc_txt = trim($_POST['account_id']);
    $account_id = $acc_txt === '' ? null : (int)$acc_txt;
    $description = trim($_POST['description']);
    if ($name !== '' && $target > 0) {
        $pdo = db();
        if ($id > 0) {
            $st = $pdo->prepare("UPDATE goals SET name=?,target_amount=?,deadline=?,account_id=?,description=? WHERE id=?");
            $st->execute([$name, $target, $deadline, $account_id, $description === '' ? null : $description, $id]);
        } else {
            $st = $pdo->prepare("INSERT INTO goals(name,target_amount,deadline,account_id,description) VALUES(?,?,?,?,?)");
            $st->execute([$name, $target, $deadline, $account_id, $description === '' ? null : $description]);
        }
        $message = 'Obiettivo salvato.';
    }
}

if ($action === 'delete_goal') {
    $id = (int)$_POST['goal_id'];
    if ($id > 0) {
        $pdo = db();
        $st = $pdo->prepare("DELETE FROM goals WHERE id=?");
        $st->execute([$id]);
        $message = 'Obiettivo eliminato.';
    }
}

$edit_account = null;
if ($page === 'accounts' && isset($_GET['edit'])) {
    $edit_account = get_account_by_id((int)$_GET['edit']);
}
$edit_category = null;
if ($page === 'categories' && isset($_GET['edit'])) {
    $edit_category = get_category_by_id((int)$_GET['edit']);
}
$edit_tx = null;
if ($page === 'transactions' && isset($_GET['edit'])) {
    $pdo = db();
    $st = $pdo->prepare("SELECT * FROM transactions WHERE id=?");
    $st->execute([(int)$_GET['edit']]);
    $edit_tx = $st->fetch(PDO::FETCH_ASSOC);
}
$edit_budget = null;
if ($page === 'budgets' && isset($_GET['edit'])) {
    $edit_budget = get_budget_by_id((int)$_GET['edit']);
}
$edit_goal = null;
if ($page === 'goals' && isset($_GET['edit'])) {
    $edit_goal = get_goal_by_id((int)$_GET['edit']);
}

$accounts_all = get_accounts(false);
$accounts_active = get_accounts(true);
$categories_all = get_categories();
$categories_income = array_filter($categories_all, function ($c) {
    return $c['type'] === 'income';
});
$categories_expense = array_filter($categories_all, function ($c) {
    return $c['type'] === 'expense';
});
$categories_transfer = array_filter($categories_all, function ($c) {
    return $c['type'] === 'transfer';
});
?>
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Assistente Finanziario Web</title>
    <style>
        body {
            margin: 0;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #1e1e1e;
            color: #f0f0f0;
        }
        a {
            color: #4fc3f7;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .topbar {
            background: #252526;
            padding: 10px 20px;
            display: flex;
            align-items: center;
            gap: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.5);
        }
        .topbar-title {
            font-size: 18px;
            font-weight: 700;
        }
        .nav {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .nav a {
            padding: 6px 10px;
            border-radius: 999px;
            background: #2d2d30;
            font-size: 13px;
        }
        .nav a.active {
            background: #007acc;
        }
        .container {
            padding: 20px;
        }
        .page-title {
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 4px;
        }
        .page-subtitle {
            font-size: 13px;
            color: #bbbbbb;
            margin-bottom: 16px;
        }
        .cards-row {
            display: grid;
            grid-template-columns: repeat(auto-fit,minmax(220px,1fr));
            gap: 10px;
            margin-bottom: 16px;
        }
        .card {
            background: #252526;
            border-radius: 10px;
            padding: 10px 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        .card-title {
            font-size: 12px;
            color: #bbbbbb;
            margin-bottom: 4px;
        }
        .card-value {
            font-size: 17px;
            font-weight: 700;
        }
        .layout-two {
            display: grid;
            grid-template-columns: minmax(0,2.2fr) minmax(0,1.8fr);
            gap: 12px;
        }
        .section {
            background: #252526;
            border-radius: 10px;
            padding: 10px 12px;
            margin-bottom: 14px;
        }
        .section-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        th, td {
            padding: 4px 6px;
            border-bottom: 1px solid #333;
        }
        th {
            text-align: left;
            background: #2d2d30;
        }
        tr:nth-child(even) td {
            background: #222224;
        }
        input[type="text"], input[type="number"], input[type="date"], select, textarea {
            width: 100%;
            box-sizing: border-box;
            border-radius: 6px;
            border: 1px solid #3a3a3d;
            background: #1e1e1e;
            color: #f0f0f0;
            padding: 5px 7px;
            font-size: 12px;
        }
        textarea {
            resize: vertical;
        }
        .form-row {
            display: grid;
            grid-template-columns: 140px minmax(0,1fr);
            gap: 6px;
            align-items: center;
            margin-bottom: 6px;
        }
        .form-label {
            font-size: 12px;
            color: #c0c0c0;
        }
        .btn {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 999px;
            border: none;
            font-size: 12px;
            cursor: pointer;
            background: #0e639c;
            color: #fff;
        }
        .btn.secondary {
            background: #3a3d41;
        }
        .btn.danger {
            background: #c62828;
        }
        .btn.small {
            padding: 3px 7px;
            font-size: 11px;
        }
        .btn + .btn {
            margin-left: 6px;
        }
        .message {
            margin-bottom: 10px;
            padding: 6px 10px;
            border-radius: 6px;
            background: #2e7d32;
            font-size: 12px;
        }
        .grid-2 {
            display: grid;
            grid-template-columns: minmax(0,1fr) minmax(0,1fr);
            gap: 12px;
        }
        pre {
            white-space: pre-wrap;
            font-size: 12px;
            background: #1e1e1e;
            padding: 6px 8px;
            border-radius: 8px;
            border: 1px solid #333;
        }
        .tag {
            display: inline-block;
            padding: 0 6px;
            border-radius: 999px;
            font-size: 10px;
            background: #424242;
            color: #fff;
            margin-left: 4px;
        }
        .tag.green {
            background: #2e7d32;
        }
        .tag.red {
            background: #c62828;
        }
        .tag.orange {
            background: #ef6c00;
        }
        .muted {
            color: #9e9e9e;
            font-size: 11px;
        }
    </style>
</head>
<body>
<div class="topbar">
    <div class="topbar-title">Assistente Finanziario Web</div>
    <div class="nav">
        <a href="?page=dashboard" class="<?php echo $page === 'dashboard' ? 'active' : ''; ?>">Dashboard</a>
        <a href="?page=accounts" class="<?php echo $page === 'accounts' ? 'active' : ''; ?>">Conti</a>
        <a href="?page=categories" class="<?php echo $page === 'categories' ? 'active' : ''; ?>">Categorie</a>
        <a href="?page=transactions" class="<?php echo $page === 'transactions' ? 'active' : ''; ?>">Transazioni</a>
        <a href="?page=budgets" class="<?php echo $page === 'budgets' ? 'active' : ''; ?>">Budget</a>
        <a href="?page=goals" class="<?php echo $page === 'goals' ? 'active' : ''; ?>">Obiettivi</a>
        <a href="?page=reports" class="<?php echo $page === 'reports' ? 'active' : ''; ?>">Report</a>
    </div>
</div>
<div class="container">
    <?php if ($message !== ''): ?>
        <div class="message"><?php echo h($message); ?></div>
    <?php endif; ?>

    <?php if ($page === 'dashboard'): ?>
        <?php
        $balances = compute_balances(true);
        $total_balance = 0.0;
        foreach ($balances as $b) {
            $total_balance += (float)$b['balance'];
        }
        $today = new DateTime();
        $start_month = new DateTime($today->format('Y-m-01'));
        $end_month = (clone $start_month)->modify('+1 month')->modify('-1 day');
        list($tot_in_m, $tot_out_m, $spread_m) = compute_period_summary($start_month, $today, true);
        $health_text = analyze_health(true);
        $health_first_line = strtok($health_text, "\n");
        ?>
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle">Panoramica sintetica e rapida del tuo stato finanziario</div>
        <div class="cards-row">
            <div class="card">
                <div class="card-title">Saldo totale (incl. saldi iniziali)</div>
                <div class="card-value"><?php echo number_format($total_balance, 2, ',', '.'); ?> €</div>
            </div>
            <div class="card">
                <div class="card-title">Entrate mese corrente</div>
                <div class="card-value"><?php echo number_format($tot_in_m, 2, ',', '.'); ?> €</div>
            </div>
            <div class="card">
                <div class="card-title">Uscite mese corrente</div>
                <div class="card-value"><?php echo number_format($tot_out_m, 2, ',', '.'); ?> €</div>
            </div>
            <div class="card">
                <div class="card-title">Spread mese corrente</div>
                <div class="card-value"><?php echo number_format($spread_m, 2, ',', '.'); ?> €</div>
            </div>
        </div>
        <div class="cards-row">
            <div class="card">
                <div class="card-title">Stato salute finanziaria</div>
                <div class="card-value"><?php echo h(str_replace('Stato complessivo: ', '', $health_first_line)); ?></div>
                <div class="muted" style="margin-top:4px;">Dettaglio disponibile nella sezione Report.</div>
            </div>
            <div class="card">
                <?php
                $txt_forecast = forecast_short_text(3, true);
                $lines_fc = explode("\n", $txt_forecast);
                ?>
                <div class="card-title">Previsione prossimi 3 mesi (ricorrenti)</div>
                <div class="muted">
                    <?php echo h($lines_fc[0]); ?><br>
                    <?php echo h($lines_fc[1]); ?>
                </div>
            </div>
        </div>
        <div class="layout-two">
            <div>
                <div class="section">
                    <div class="section-title">Saldi per conto</div>
                    <table>
                        <thead>
                        <tr>
                            <th>Conto</th>
                            <th>Tipo</th>
                            <th>Saldo</th>
                            <th>Valuta</th>
                        </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($balances as $b): ?>
                            <tr>
                                <td><?php echo h($b['name']); ?></td>
                                <td>
                                    <?php echo h(get_account_by_id($b['id'])['type']); ?>
                                </td>
                                <td><?php echo number_format($b['balance'], 2, ',', '.'); ?></td>
                                <td><?php echo h($b['currency']); ?></td>
                            </tr>
                        <?php endforeach; ?>
                        <?php if (empty($balances)): ?>
                            <tr><td colspan="4" class="muted">Nessun conto definito.</td></tr>
                        <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <div>
                <div class="section">
                    <div class="section-title">Ultime transazioni registrate</div>
                    <table>
                        <thead>
                        <tr>
                            <th>Data</th>
                            <th>Conto</th>
                            <th>Tipo</th>
                            <th>Importo</th>
                            <th>Categoria</th>
                            <th>Privata</th>
                            <th>Descrizione</th>
                        </tr>
                        </thead>
                        <tbody>
                        <?php
                        $pdo = db();
                        $st = $pdo->query("
                            SELECT t.id,t.date,a.name AS account_name,t.amount,t.direction,
                                   COALESCE(c.name,'-') AS cat_name,t.is_private,t.description
                            FROM transactions t
                            JOIN accounts a ON t.account_id=a.id
                            LEFT JOIN categories c ON t.category_id=c.id
                            ORDER BY t.date DESC,t.id DESC
                            LIMIT 20
                        ");
                        $rows_tx = $st->fetchAll(PDO::FETCH_ASSOC);
                        foreach ($rows_tx as $r):
                            $sign = $r['direction'] === 'in' ? '+' : '-';
                            ?>
                            <tr>
                                <td><?php echo h($r['date']); ?></td>
                                <td><?php echo h($r['account_name']); ?></td>
                                <td><?php echo $r['direction'] === 'in' ? 'Entrata' : 'Uscita'; ?></td>
                                <td><?php echo $sign . number_format($r['amount'], 2, ',', '.'); ?></td>
                                <td><?php echo h($r['cat_name']); ?></td>
                                <td><?php echo $r['is_private'] ? 'Sì' : 'No'; ?></td>
                                <td><?php echo h(mb_strimwidth($r['description'], 0, 40, '…', 'UTF-8')); ?></td>
                            </tr>
                        <?php endforeach; ?>
                        <?php if (empty($rows_tx)): ?>
                            <tr><td colspan="7" class="muted">Nessuna transazione.</td></tr>
                        <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

    <?php elseif ($page === 'accounts'): ?>
        <div class="page-title">Conti</div>
        <div class="page-subtitle">Gestisci contanti, conti bancari, wallet crypto, bauspar e altri contenitori di denaro</div>
        <div class="layout-two">
            <div>
                <div class="section">
                    <div class="section-title">Elenco conti</div>
                    <table>
                        <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Tipo</th>
                            <th>Valuta</th>
                            <th>Saldo iniziale</th>
                            <th>Stato</th>
                            <th>Azioni</th>
                        </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($accounts_all as $a): ?>
                            <tr>
                                <td><?php echo h($a['name']); ?></td>
                                <td><?php echo h($a['type']); ?></td>
                                <td><?php echo h($a['currency']); ?></td>
                                <td><?php echo number_format($a['initial_balance'], 2, ',', '.'); ?></td>
                                <td><?php echo $a['is_active'] ? 'Attivo' : 'Chiuso'; ?></td>
                                <td>
                                    <a class="btn small secondary" href="?page=accounts&edit=<?php echo (int)$a['id']; ?>">Modifica</a>
                                    <form method="post" style="display:inline;">
                                        <input type="hidden" name="action" value="delete_account">
                                        <input type="hidden" name="account_id" value="<?php echo (int)$a['id']; ?>">
                                        <button class="btn small danger" onclick="return confirm('Eliminare questo conto?');">Elimina</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        <?php if (empty($accounts_all)): ?>
                            <tr><td colspan="6" class="muted">Nessun conto ancora definito.</td></tr>
                        <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <div>
                <?php
                $acc_form = [
                    'id' => $edit_account ? $edit_account['id'] : 0,
                    'name' => $edit_account ? $edit_account['name'] : '',
                    'type' => $edit_account ? $edit_account['type'] : '',
                    'currency' => $edit_account ? $edit_account['currency'] : 'EUR',
                    'description' => $edit_account ? $edit_account['description'] : '',
                    'is_active' => $edit_account ? (int)$edit_account['is_active'] : 1,
                    'initial_balance' => $edit_account ? $edit_account['initial_balance'] : 0.0
                ];
                ?>
                <div class="section">
                    <div class="section-title"><?php echo $acc_form['id'] ? 'Modifica conto' : 'Nuovo conto'; ?></div>
                    <form method="post">
                        <input type="hidden" name="action" value="save_account">
                        <input type="hidden" name="account_id" value="<?php echo (int)$acc_form['id']; ?>">
                        <div class="form-row">
                            <div class="form-label">Nome conto</div>
                            <div><input type="text" name="name" value="<?php echo h($acc_form['name']); ?>" required></div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Tipologia</div>
                            <div>
                                <select name="type" required>
                                    <?php
                                    $types = ['Contanti', 'Conto bancario', 'Carta di credito', 'Wallet crypto', 'Bauspar', 'Altro'];
                                    foreach ($types as $t):
                                        $val = $t;
                                        ?>
                                        <option value="<?php echo h($val); ?>" <?php echo $acc_form['type'] === $val ? 'selected' : ''; ?>>
                                            <?php echo h($t); ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Valuta</div>
                            <div>
                                <select name="currency">
                                    <?php
                                    $currs = ['EUR', 'USD', 'CHF', 'GBP'];
                                    foreach ($currs as $c):
                                        ?>
                                        <option value="<?php echo h($c); ?>" <?php echo $acc_form['currency'] === $c ? 'selected' : ''; ?>>
                                            <?php echo h($c); ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Saldo iniziale</div>
                            <div><input type="number" step="0.01" name="initial_balance" value="<?php echo h($acc_form['initial_balance']); ?>"></div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Descrizione</div>
                            <div><textarea name="description" rows="2"><?php echo h($acc_form['description']); ?></textarea></div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Stato</div>
                            <div><label><input type="checkbox" name="is_active" <?php echo $acc_form['is_active'] ? 'checked' : ''; ?>> Conto attivo</label></div>
                        </div>
                        <div style="margin-top:8px;">
                            <button class="btn" type="submit">Salva conto</button>
                            <a class="btn secondary" href="?page=accounts">Nuovo</a>
                        </div>
                        <div class="muted" style="margin-top:6px;">Il saldo iniziale viene sommato alle transazioni per il calcolo del saldo attuale.</div>
                    </form>
                </div>
            </div>
        </div>

    <?php elseif ($page === 'categories'): ?>
        <div class="page-title">Categorie</div>
        <div class="page-subtitle">Organizza entrate, uscite e trasferimenti in categorie leggibili</div>
        <div class="layout-two">
            <div>
                <div class="section">
                    <div class="section-title">Elenco categorie</div>
                    <table>
                        <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Tipo</th>
                            <th>Categoria padre</th>
                            <th>Azioni</th>
                        </tr>
                        </thead>
                        <tbody>
                        <?php
                        $cat_by_id = [];
                        foreach ($categories_all as $c) {
                            $cat_by_id[$c['id']] = $c;
                        }
                        foreach ($categories_all as $c):
                            $parent_name = '';
                            if ($c['parent_id']) {
                                $parent_name = isset($cat_by_id[$c['parent_id']]) ? $cat_by_id[$c['parent_id']]['name'] : '';
                            }
                            ?>
                            <tr>
                                <td><?php echo h($c['name']); ?></td>
                                <td><?php echo $c['type'] === 'income' ? 'Entrata' : ($c['type'] === 'expense' ? 'Uscita' : 'Trasferimento'); ?></td>
                                <td><?php echo h($parent_name); ?></td>
                                <td>
                                    <a class="btn small secondary" href="?page=categories&edit=<?php echo (int)$c['id']; ?>">Modifica</a>
                                    <form method="post" style="display:inline;">
                                        <input type="hidden" name="action" value="delete_category">
                                        <input type="hidden" name="category_id" value="<?php echo (int)$c['id']; ?>">
                                        <button class="btn small danger" onclick="return confirm('Eliminare questa categoria?');">Elimina</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        <?php if (empty($categories_all)): ?>
                            <tr><td colspan="4" class="muted">Nessuna categoria.</td></tr>
                        <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <div>
                <?php
                $cat_form = [
                    'id' => $edit_category ? $edit_category['id'] : 0,
                    'name' => $edit_category ? $edit_category['name'] : '',
                    'type' => $edit_category ? $edit_category['type'] : 'expense',
                    'parent_id' => $edit_category ? $edit_category['parent_id'] : null
                ];
                ?>
                <div class="section">
                    <div class="section-title"><?php echo $cat_form['id'] ? 'Modifica categoria' : 'Nuova categoria'; ?></div>
                    <form method="post">
                        <input type="hidden" name="action" value="save_category">
                        <input type="hidden" name="category_id" value="<?php echo (int)$cat_form['id']; ?>">
                        <div class="form-row">
                            <div class="form-label">Nome categoria</div>
                            <div><input type="text" name="name" value="<?php echo h($cat_form['name']); ?>" required></div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Tipo</div>
                            <div>
                                <select name="type">
                                    <option value="income" <?php echo $cat_form['type'] === 'income' ? 'selected' : ''; ?>>Entrata</option>
                                    <option value="expense" <?php echo $cat_form['type'] === 'expense' ? 'selected' : ''; ?>>Uscita</option>
                                    <option value="transfer" <?php echo $cat_form['type'] === 'transfer' ? 'selected' : ''; ?>>Trasferimento</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Categoria padre (opzionale)</div>
                            <div>
                                <select name="parent">
                                    <option value="">Nessuna</option>
                                    <?php foreach ($categories_all as $c): ?>
                                        <option value="<?php echo (int)$c['id']; ?>" <?php echo $cat_form['parent_id'] == $c['id'] ? 'selected' : ''; ?>>
                                            <?php echo h($c['name']); ?> (<?php echo h($c['type']); ?>)
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                        </div>
                        <div style="margin-top:8px;">
                            <button class="btn" type="submit">Salva categoria</button>
                            <a class="btn secondary" href="?page=categories">Nuova</a>
                        </div>
                    </form>
                </div>
            </div>
        </div>

    <?php elseif ($page === 'transactions'): ?>
        <div class="page-title">Transazioni</div>
        <div class="page-subtitle">Registra entrate, uscite, movimenti ricorrenti e privati su qualsiasi data</div>
        <div class="section">
            <div class="section-title">Filtri rapidi</div>
            <?php
            $flt_start = isset($_GET['start']) ? safe_date($_GET['start']) : (new DateTime())->modify('-30 days');
            $flt_end = isset($_GET['end']) ? safe_date($_GET['end']) : new DateTime();
            $flt_dir = isset($_GET['direction']) ? $_GET['direction'] : 'all';
            $flt_acc = isset($_GET['acc']) ? (int)$_GET['acc'] : 0;
            $flt_priv = isset($_GET['priv']) ? $_GET['priv'] : 'all';
            ?>
            <form method="get" style="margin-bottom:6px;">
                <input type="hidden" name="page" value="transactions">
                <div class="grid-2">
                    <div class="form-row">
                        <div class="form-label">Da data</div>
                        <div><input type="date" name="start" value="<?php echo h($flt_start->format('Y-m-d')); ?>"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-label">A data</div>
                        <div><input type="date" name="end" value="<?php echo h($flt_end->format('Y-m-d')); ?>"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-label">Tipo movimento</div>
                        <div>
                            <select name="direction">
                                <option value="all" <?php echo $flt_dir === 'all' ? 'selected' : ''; ?>>Entrate e uscite</option>
                                <option value="in" <?php echo $flt_dir === 'in' ? 'selected' : ''; ?>>Solo entrate</option>
                                <option value="out" <?php echo $flt_dir === 'out' ? 'selected' : ''; ?>>Solo uscite</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-label">Conto</div>
                        <div>
                            <select name="acc">
                                <option value="0">Tutti i conti</option>
                                <?php foreach ($accounts_all as $a): ?>
                                    <option value="<?php echo (int)$a['id']; ?>" <?php echo $flt_acc === (int)$a['id'] ? 'selected' : ''; ?>>
                                        <?php echo h($a['name']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-label">Movimenti privati</div>
                        <div>
                            <select name="priv">
                                <option value="all" <?php echo $flt_priv === 'all' ? 'selected' : ''; ?>>Includi tutti</option>
                                <option value="public" <?php echo $flt_priv === 'public' ? 'selected' : ''; ?>>Solo pubblici</option>
                                <option value="private" <?php echo $flt_priv === 'private' ? 'selected' : ''; ?>>Solo privati</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-label"></div>
                        <div>
                            <button class="btn" type="submit">Applica filtri</button>
                        </div>
                    </div>
                </div>
            </form>
            <div class="layout-two">
                <div>
                    <div class="section" style="background:none;padding:0;margin:0;">
                        <div class="section-title">Transazioni nell'intervallo</div>
                        <table>
                            <thead>
                            <tr>
                                <th>Data</th>
                                <th>Conto</th>
                                <th>Tipo</th>
                                <th>Importo</th>
                                <th>Categoria</th>
                                <th>Ricorrente</th>
                                <th>Privata</th>
                                <th>Descrizione</th>
                                <th>Azioni</th>
                            </tr>
                            </thead>
                            <tbody>
                            <?php
                            $pdo = db();
                            $where = "WHERE t.date BETWEEN :s AND :e";
                            $params = [
                                ':s' => $flt_start->format('Y-m-d'),
                                ':e' => $flt_end->format('Y-m-d')
                            ];
                            if ($flt_dir === 'in' || $flt_dir === 'out') {
                                $where .= " AND t.direction=:d";
                                $params[':d'] = $flt_dir;
                            }
                            if ($flt_acc > 0) {
                                $where .= " AND t.account_id=:acc";
                                $params[':acc'] = $flt_acc;
                            }
                            if ($flt_priv === 'public') {
                                $where .= " AND t.is_private=0";
                            } elseif ($flt_priv === 'private') {
                                $where .= " AND t.is_private=1";
                            }
                            $sql = "
                                SELECT t.*,a.name AS account_name,COALESCE(c.name,'-') AS cat_name
                                FROM transactions t
                                JOIN accounts a ON t.account_id=a.id
                                LEFT JOIN categories c ON t.category_id=c.id
                                $where
                                ORDER BY t.date DESC,t.id DESC
                                LIMIT 300
                            ";
                            $st = $pdo->prepare($sql);
                            $st->execute($params);
                            $tx_rows = $st->fetchAll(PDO::FETCH_ASSOC);
                            foreach ($tx_rows as $r):
                                $sign = $r['direction'] === 'in' ? '+' : '-';
                                ?>
                                <tr>
                                    <td><?php echo h($r['date']); ?></td>
                                    <td><?php echo h($r['account_name']); ?></td>
                                    <td><?php echo $r['direction'] === 'in' ? 'Entrata' : 'Uscita'; ?></td>
                                    <td><?php echo $sign . number_format($r['amount'], 2, ',', '.'); ?></td>
                                    <td><?php echo h($r['cat_name']); ?></td>
                                    <td><?php echo $r['freq'] === 'once' ? 'Una tantum' : h($r['freq']); ?></td>
                                    <td><?php echo $r['is_private'] ? 'Sì' : 'No'; ?></td>
                                    <td><?php echo h(mb_strimwidth($r['description'], 0, 40, '…', 'UTF-8')); ?></td>
                                    <td>
                                        <a class="btn small secondary" href="?page=transactions&edit=<?php echo (int)$r['id']; ?>">Modifica</a>
                                        <form method="post" style="display:inline;">
                                            <input type="hidden" name="action" value="delete_transaction">
                                            <input type="hidden" name="tx_id" value="<?php echo (int)$r['id']; ?>">
                                            <button class="btn small danger" onclick="return confirm('Eliminare questa transazione?');">Elimina</button>
                                        </form>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                            <?php if (empty($tx_rows)): ?>
                                <tr><td colspan="9" class="muted">Nessuna transazione per i filtri selezionati.</td></tr>
                            <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div>
                    <?php
                    $tx_form = [
                        'id' => $edit_tx ? $edit_tx['id'] : 0,
                        'date' => $edit_tx ? $edit_tx['date'] : (new DateTime())->format('Y-m-d'),
                        'account_id' => $edit_tx ? $edit_tx['account_id'] : 0,
                        'amount' => $edit_tx ? $edit_tx['amount'] : '',
                        'direction' => $edit_tx ? $edit_tx['direction'] : 'out',
                        'category_id' => $edit_tx ? $edit_tx['category_id'] : null,
                        'description' => $edit_tx ? $edit_tx['description'] : '',
                        'is_private' => $edit_tx ? $edit_tx['is_private'] : 0,
                        'freq' => $edit_tx ? $edit_tx['freq'] : 'once',
                        'income_kind' => $edit_tx ? $edit_tx['income_kind'] : 'variable'
                    ];
                    ?>
                    <div class="section">
                        <div class="section-title"><?php echo $tx_form['id'] ? 'Modifica transazione' : 'Nuova transazione'; ?></div>
                        <form method="post">
                            <input type="hidden" name="action" value="save_transaction">
                            <input type="hidden" name="tx_id" value="<?php echo (int)$tx_form['id']; ?>">
                            <div class="form-row">
                                <div class="form-label">Data</div>
                                <div><input type="date" name="date" value="<?php echo h($tx_form['date']); ?>"></div>
                            </div>
                            <div class="form-row">
                                <div class="form-label">Conto</div>
                                <div>
                                    <select name="account_id" required>
                                        <option value="">Seleziona</option>
                                        <?php foreach ($accounts_all as $a): ?>
                                            <option value="<?php echo (int)$a['id']; ?>" <?php echo $tx_form['account_id'] == $a['id'] ? 'selected' : ''; ?>>
                                                <?php echo h($a['name']); ?> (<?php echo h($a['currency']); ?>)
                                            </option>
                                        <?php endforeach; ?>
                                    </select>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-label">Tipo movimento</div>
                                <div>
                                    <select name="direction" id="tx_direction_select">
                                        <option value="out" <?php echo $tx_form['direction'] === 'out' ? 'selected' : ''; ?>>Uscita</option>
                                        <option value="in" <?php echo $tx_form['direction'] === 'in' ? 'selected' : ''; ?>>Entrata</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-label">Importo</div>
                                <div><input type="number" step="0.01" name="amount" value="<?php echo h($tx_form['amount']); ?>" required></div>
                            </div>
                            <div class="form-row">
                                <div class="form-label">Categoria</div>
                                <div>
                                    <select name="category_id" id="tx_category_select">
                                        <option value="">Nessuna</option>
                                        <optgroup label="Uscite">
                                            <?php foreach ($categories_expense as $c): ?>
                                                <option value="<?php echo (int)$c['id']; ?>" <?php echo $tx_form['category_id'] == $c['id'] ? 'selected' : ''; ?>>
                                                    <?php echo h($c['name']); ?>
                                                </option>
                                            <?php endforeach; ?>
                                        </optgroup>
                                        <optgroup label="Entrate">
                                            <?php foreach ($categories_income as $c): ?>
                                                <option value="<?php echo (int)$c['id']; ?>" <?php echo $tx_form['category_id'] == $c['id'] ? 'selected' : ''; ?>>
                                                    <?php echo h($c['name']); ?>
                                                </option>
                                            <?php endforeach; ?>
                                        </optgroup>
                                        <optgroup label="Trasferimenti">
                                            <?php foreach ($categories_transfer as $c): ?>
                                                <option value="<?php echo (int)$c['id']; ?>" <?php echo $tx_form['category_id'] == $c['id'] ? 'selected' : ''; ?>>
                                                    <?php echo h($c['name']); ?>
                                                </option>
                                            <?php endforeach; ?>
                                        </optgroup>
                                    </select>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-label">Descrizione</div>
                                <div><textarea name="description" rows="2"><?php echo h($tx_form['description']); ?></textarea></div>
                            </div>
                            <div class="form-row">
                                <div class="form-label">Visibilità</div>
                                <div>
                                    <label><input type="checkbox" name="is_private" <?php echo $tx_form['is_private'] ? 'checked' : ''; ?>> Movimento privato (escludibile da alcuni report)</label>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-label">Frequenza</div>
                                <div>
                                    <select name="freq">
                                        <option value="once" <?php echo $tx_form['freq'] === 'once' ? 'selected' : ''; ?>>Una tantum</option>
                                        <option value="daily" <?php echo $tx_form['freq'] === 'daily' ? 'selected' : ''; ?>>Giornaliera</option>
                                        <option value="weekly" <?php echo $tx_form['freq'] === 'weekly' ? 'selected' : ''; ?>>Settimanale</option>
                                        <option value="monthly" <?php echo $tx_form['freq'] === 'monthly' ? 'selected' : ''; ?>>Mensile</option>
                                        <option value="yearly" <?php echo $tx_form['freq'] === 'yearly' ? 'selected' : ''; ?>>Annuale</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-row" id="income_kind_row">
                                <div class="form-label">Tipo entrata</div>
                                <div>
                                    <select name="income_kind">
                                        <option value="fixed" <?php echo $tx_form['income_kind'] === 'fixed' ? 'selected' : ''; ?>>Entrata fissa</option>
                                        <option value="variable" <?php echo $tx_form['income_kind'] === 'variable' ? 'selected' : ''; ?>>Entrata variabile</option>
                                        <option value="one-off" <?php echo $tx_form['income_kind'] === 'one-off' ? 'selected' : ''; ?>>Entrata una tantum</option>
                                    </select>
                                </div>
                            </div>
                            <div style="margin-top:8px;">
                                <button class="btn" type="submit">Salva transazione</button>
                                <a class="btn secondary" href="?page=transactions">Nuova</a>
                            </div>
                            <div class="muted" style="margin-top:6px;">Puoi inserire liberamente date passate o future. Le ricorrenze vengono utilizzate nelle analisi e previsioni.</div>
                        </form>
                    </div>
                </div>
            </div>
        </div>

    <?php elseif ($page === 'budgets'): ?>
        <div class="page-title">Budget</div>
        <div class="page-subtitle">Imposta limiti di spesa e obiettivi di entrata per categoria e controlla lo stato del mese</div>
        <div class="layout-two">
            <div>
                <div class="section">
                    <div class="section-title">Budget definiti</div>
                    <table>
                        <thead>
                        <tr>
                            <th>Categoria</th>
                            <th>Tipo cat.</th>
                            <th>Periodo</th>
                            <th>Importo</th>
                            <th>Data inizio</th>
                            <th>Azioni</th>
                        </tr>
                        </thead>
                        <tbody>
                        <?php
                        $budgets = get_budgets();
                        foreach ($budgets as $b):
                            ?>
                            <tr>
                                <td><?php echo h($b['category_name']); ?></td>
                                <td><?php echo $b['category_type'] === 'expense' ? 'Uscite' : 'Entrate'; ?></td>
                                <td><?php echo $b['period_type'] === 'monthly' ? 'Mensile' : 'Annuale'; ?></td>
                                <td><?php echo number_format($b['amount'], 2, ',', '.'); ?></td>
                                <td><?php echo h($b['start_date']); ?></td>
                                <td>
                                    <a class="btn small secondary" href="?page=budgets&edit=<?php echo (int)$b['id']; ?>">Modifica</a>
                                    <form method="post" style="display:inline;">
                                        <input type="hidden" name="action" value="delete_budget">
                                        <input type="hidden" name="budget_id" value="<?php echo (int)$b['id']; ?>">
                                        <button class="btn small danger" onclick="return confirm('Eliminare questo budget?');">Elimina</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        <?php if (empty($budgets)): ?>
                            <tr><td colspan="6" class="muted">Nessun budget definito.</td></tr>
                        <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <div>
                <?php
                $bud_form = [
                    'id' => $edit_budget ? $edit_budget['id'] : 0,
                    'category_id' => $edit_budget ? $edit_budget['category_id'] : 0,
                    'period_type' => $edit_budget ? $edit_budget['period_type'] : 'monthly',
                    'amount' => $edit_budget ? $edit_budget['amount'] : '',
                    'start_date' => $edit_budget ? $edit_budget['start_date'] : ''
                ];
                ?>
                <div class="section">
                    <div class="section-title"><?php echo $bud_form['id'] ? 'Modifica budget' : 'Nuovo budget'; ?></div>
                    <form method="post">
                        <input type="hidden" name="action" value="save_budget">
                        <input type="hidden" name="budget_id" value="<?php echo (int)$bud_form['id']; ?>">
                        <div class="form-row">
                            <div class="form-label">Categoria</div>
                            <div>
                                <select name="category_id" required>
                                    <option value="">Seleziona categoria</option>
                                    <?php foreach ($categories_all as $c): ?>
                                        <option value="<?php echo (int)$c['id']; ?>" <?php echo $bud_form['category_id'] == $c['id'] ? 'selected' : ''; ?>>
                                            <?php echo h($c['name']); ?> (<?php echo $c['type'] === 'expense' ? 'Uscite' : 'Entrate'; ?>)
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Periodo</div>
                            <div>
                                <select name="period_type">
                                    <option value="monthly" <?php echo $bud_form['period_type'] === 'monthly' ? 'selected' : ''; ?>>Mensile</option>
                                    <option value="yearly" <?php echo $bud_form['period_type'] === 'yearly' ? 'selected' : ''; ?>>Annuale</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Importo obiettivo</div>
                            <div><input type="number" step="0.01" name="amount" value="<?php echo h($bud_form['amount']); ?>" required></div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Data inizio (opzionale)</div>
                            <div><input type="date" name="start_date" value="<?php echo h($bud_form['start_date']); ?>"></div>
                        </div>
                        <div style="margin-top:8px;">
                            <button class="btn" type="submit">Salva budget</button>
                            <a class="btn secondary" href="?page=budgets">Nuovo</a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        <div class="section">
            <div class="section-title">Stato budget mese corrente</div>
            <table>
                <thead>
                <tr>
                    <th>Categoria</th>
                    <th>Tipo</th>
                    <th>Budget</th>
                    <th>Usato</th>
                    <th>Delta</th>
                    <th>Stato</th>
                </tr>
                </thead>
                <tbody>
                <?php
                list($bs, $be, $brows) = compute_budget_status('monthly');
                foreach ($brows as $r):
                    $tag_class = $r['status'] === 'OK' ? 'green' : ($r['category_type'] === 'expense' ? 'red' : 'orange');
                    ?>
                    <tr>
                        <td><?php echo h($r['category_name']); ?></td>
                        <td><?php echo $r['category_type'] === 'expense' ? 'Uscite' : 'Entrate'; ?></td>
                        <td><?php echo number_format($r['amount'], 2, ',', '.'); ?></td>
                        <td><?php echo number_format($r['used'], 2, ',', '.'); ?></td>
                        <td><?php echo number_format($r['diff'], 2, ',', '.'); ?></td>
                        <td><?php echo h($r['status']); ?></td>
                    </tr>
                <?php endforeach; ?>
                <?php if (empty($brows)): ?>
                    <tr><td colspan="6" class="muted">Nessun budget mensile definito.</td></tr>
                <?php endif; ?>
                </tbody>
            </table>
            <div class="muted" style="margin-top:4px;">Il periodo considerato è <?php echo h($bs->format('Y-m-d')); ?> - <?php echo h($be->format('Y-m-d')); ?>.</div>
        </div>

    <?php elseif ($page === 'goals'): ?>
        <div class="page-title">Obiettivi e spese grandi pianificate</div>
        <div class="page-subtitle">Imposta traguardi di risparmio e spese importanti future, collegandoli ai conti</div>
        <div class="layout-two">
            <div>
                <div class="section">
                    <div class="section-title">Obiettivi attuali</div>
                    <table>
                        <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Target</th>
                            <th>Deadline</th>
                            <th>Conto di riferimento</th>
                            <th>Progress</th>
                            <th>Mancano</th>
                            <th>Stato</th>
                            <th>Azioni</th>
                        </tr>
                        </thead>
                        <tbody>
                        <?php
                        $goals = compute_goals_status();
                        foreach ($goals as $g):
                            $tag_class = $g['status'] === 'RAGGIUNTO' ? 'green' : 'orange';
                            ?>
                            <tr>
                                <td><?php echo h($g['name']); ?></td>
                                <td><?php echo number_format($g['target'], 2, ',', '.'); ?></td>
                                <td><?php echo h($g['deadline']); ?></td>
                                <td><?php echo h($g['account_name'] ? $g['account_name'] : 'Tutti i conti'); ?></td>
                                <td><?php echo number_format($g['progress'], 2, ',', '.'); ?></td>
                                <td><?php echo number_format($g['remaining'], 2, ',', '.'); ?></td>
                                <td><?php echo h($g['status']); ?></td>
                                <td>
                                    <a class="btn small secondary" href="?page=goals&edit=<?php echo (int)$g['id']; ?>">Modifica</a>
                                    <form method="post" style="display:inline;">
                                        <input type="hidden" name="action" value="delete_goal">
                                        <input type="hidden" name="goal_id" value="<?php echo (int)$g['id']; ?>">
                                        <button class="btn small danger" onclick="return confirm('Eliminare questo obiettivo?');">Elimina</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        <?php if (empty($goals)): ?>
                            <tr><td colspan="8" class="muted">Nessun obiettivo ancora definito.</td></tr>
                        <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <div>
                <?php
                $goal_form = [
                    'id' => $edit_goal ? $edit_goal['id'] : 0,
                    'name' => $edit_goal ? $edit_goal['name'] : '',
                    'target_amount' => $edit_goal ? $edit_goal['target_amount'] : '',
                    'deadline' => $edit_goal ? $edit_goal['deadline'] : '',
                    'account_id' => $edit_goal ? $edit_goal['account_id'] : null,
                    'description' => $edit_goal ? $edit_goal['description'] : ''
                ];
                ?>
                <div class="section">
                    <div class="section-title"><?php echo $goal_form['id'] ? 'Modifica obiettivo' : 'Nuovo obiettivo / spesa grande'; ?></div>
                    <form method="post">
                        <input type="hidden" name="action" value="save_goal">
                        <input type="hidden" name="goal_id" value="<?php echo (int)$goal_form['id']; ?>">
                        <div class="form-row">
                            <div class="form-label">Nome obiettivo</div>
                            <div><input type="text" name="name" value="<?php echo h($goal_form['name']); ?>" required></div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Target (€)</div>
                            <div><input type="number" step="0.01" name="target_amount" value="<?php echo h($goal_form['target_amount']); ?>" required></div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Deadline (opzionale)</div>
                            <div><input type="date" name="deadline" value="<?php echo h($goal_form['deadline']); ?>"></div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Conto principale</div>
                            <div>
                                <select name="account_id">
                                    <option value="">Tutti i conti</option>
                                    <?php foreach ($accounts_all as $a): ?>
                                        <option value="<?php echo (int)$a['id']; ?>" <?php echo $goal_form['account_id'] == $a['id'] ? 'selected' : ''; ?>>
                                            <?php echo h($a['name']); ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Descrizione</div>
                            <div><textarea name="description" rows="3"><?php echo h($goal_form['description']); ?></textarea></div>
                        </div>
                        <div style="margin-top:8px;">
                            <button class="btn" type="submit">Salva obiettivo</button>
                            <a class="btn secondary" href="?page=goals">Nuovo</a>
                        </div>
                        <div class="muted" style="margin-top:6px;">Gli obiettivi possono rappresentare sia risparmi (ad es. fondo emergenza) che spese future (ad es. auto nuova).</div>
                    </form>
                </div>
            </div>
        </div>

    <?php elseif ($page === 'reports'): ?>
        <div class="page-title">Report e analisi</div>
        <div class="page-subtitle">Riepilogo saldi, analisi per periodo, categorie, salute e previsioni</div>
        <div class="grid-2">
            <div>
                <div class="section">
                    <div class="section-title">Saldi attuali per conto</div>
                    <?php
                    $balances = compute_balances(true);
                    $tot = 0.0;
                    foreach ($balances as $b) {
                        $tot += (float)$b['balance'];
                    }
                    ?>
                    <div class="muted" style="margin-bottom:6px;">Saldo totale complessivo: <strong><?php echo number_format($tot, 2, ',', '.'); ?> €</strong></div>
                    <table>
                        <thead>
                        <tr>
                            <th>Conto</th>
                            <th>Tipo</th>
                            <th>Saldo</th>
                            <th>Valuta</th>
                        </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($balances as $b): ?>
                            <tr>
                                <td><?php echo h($b['name']); ?></td>
                                <td><?php echo h(get_account_by_id($b['id'])['type']); ?></td>
                                <td><?php echo number_format($b['balance'], 2, ',', '.'); ?></td>
                                <td><?php echo h($b['currency']); ?></td>
                            </tr>
                        <?php endforeach; ?>
                        <?php if (empty($balances)): ?>
                            <tr><td colspan="4" class="muted">Nessun conto definito.</td></tr>
                        <?php endif; ?>
                        </tbody>
                    </table>
                </div>
                <div class="section">
                    <div class="section-title">Analisi salute finanziaria</div>
                    <pre><?php echo h(analyze_health(true)); ?></pre>
                </div>
            </div>
            <div>
                <div class="section">
                    <div class="section-title">Riepilogo entrate/uscite per periodo</div>
                    <?php
                    $rp_start = isset($_GET['rp_start']) ? safe_date($_GET['rp_start']) : (new DateTime())->modify('-30 days');
                    $rp_end = isset($_GET['rp_end']) ? safe_date($_GET['rp_end']) : new DateTime();
                    list($rp_in, $rp_out, $rp_spread, $rp_avg_in, $rp_avg_out) = compute_period_summary($rp_start, $rp_end, true);
                    ?>
                    <form method="get" style="margin-bottom:6px;">
                        <input type="hidden" name="page" value="reports">
                        <div class="form-row">
                            <div class="form-label">Da data</div>
                            <div><input type="date" name="rp_start" value="<?php echo h($rp_start->format('Y-m-d')); ?>"></div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">A data</div>
                            <div><input type="date" name="rp_end" value="<?php echo h($rp_end->format('Y-m-d')); ?>"></div>
                        </div>
                        <div style="margin-top:4px;">
                            <button class="btn" type="submit">Ricalcola periodo</button>
                        </div>
                    </form>
                    <pre><?php
                        echo "Periodo " . $rp_start->format('Y-m-d') . " - " . $rp_end->format('Y-m-d') . "\n\n";
                        echo "Entrate: " . number_format($rp_in, 2, ',', '.') . " €\n";
                        echo "Uscite: " . number_format($rp_out, 2, ',', '.') . " €\n";
                        echo "Spread: " . number_format($rp_spread, 2, ',', '.') . " €\n\n";
                        echo "Media giornaliera entrate: " . number_format($rp_avg_in, 2, ',', '.') . " €\n";
                        echo "Media giornaliera uscite: " . number_format($rp_avg_out, 2, ',', '.') . " €\n";
                        ?></pre>
                </div>
                <div class="section">
                    <div class="section-title">Categorie principali nel periodo</div>
                    <?php
                    $rc_start = isset($_GET['rc_start']) ? safe_date($_GET['rc_start']) : (new DateTime())->modify('-30 days');
                    $rc_end = isset($_GET['rc_end']) ? safe_date($_GET['rc_end']) : new DateTime();
                    $rc_dir = isset($_GET['rc_dir']) ? $_GET['rc_dir'] : 'all';
                    $dir_filter = null;
                    if ($rc_dir === 'in' || $rc_dir === 'out') {
                        $dir_filter = $rc_dir;
                    }
                    $rows_cat = compute_category_totals($rc_start, $rc_end, true, $dir_filter);
                    ?>
                    <form method="get" style="margin-bottom:6px;">
                        <input type="hidden" name="page" value="reports">
                        <div class="form-row">
                            <div class="form-label">Da data</div>
                            <div><input type="date" name="rc_start" value="<?php echo h($rc_start->format('Y-m-d')); ?>"></div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">A data</div>
                            <div><input type="date" name="rc_end" value="<?php echo h($rc_end->format('Y-m-d')); ?>"></div>
                        </div>
                        <div class="form-row">
                            <div class="form-label">Tipo</div>
                            <div>
                                <select name="rc_dir">
                                    <option value="all" <?php echo $rc_dir === 'all' ? 'selected' : ''; ?>>Entrate e uscite</option>
                                    <option value="in" <?php echo $rc_dir === 'in' ? 'selected' : ''; ?>>Solo entrate</option>
                                    <option value="out" <?php echo $rc_dir === 'out' ? 'selected' : ''; ?>>Solo uscite</option>
                                </select>
                            </div>
                        </div>
                        <div style="margin-top:4px;">
                            <button class="btn" type="submit">Ricalcola categorie</button>
                        </div>
                    </form>
                    <table>
                        <thead>
                        <tr>
                            <th>Categoria</th>
                            <th>Netto</th>
                            <th>Entrate</th>
                            <th>Uscite</th>
                        </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($rows_cat as $r): ?>
                            <tr>
                                <td><?php echo h($r['cat']); ?></td>
                                <td><?php echo number_format($r['net'], 2, ',', '.'); ?></td>
                                <td><?php echo number_format($r['tot_in'], 2, ',', '.'); ?></td>
                                <td><?php echo number_format($r['tot_out'], 2, ',', '.'); ?></td>
                            </tr>
                        <?php endforeach; ?>
                        <?php if (empty($rows_cat)): ?>
                            <tr><td colspan="4" class="muted">Nessun dato per il periodo.</td></tr>
                        <?php endif; ?>
                        </tbody>
                    </table>
                </div>
                <div class="section">
                    <div class="section-title">Quanto puoi spendere oggi</div>
                    <pre><?php echo h(compute_safe_daily_spend_text(true)); ?></pre>
                </div>
                <div class="section">
                    <div class="section-title">Previsione prossimi 3 mesi (solo ricorrenti)</div>
                    <pre><?php echo h(forecast_short_text(3, true)); ?></pre>
                </div>
            </div>
        </div>

    <?php endif; ?>
</div>

<script>
    function updateIncomeKindVisibility() {
        var dir = document.getElementById('tx_direction_select');
        var row = document.getElementById('income_kind_row');
        if (!dir || !row) return;
        if (dir.value === 'in') {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    }
    document.addEventListener('DOMContentLoaded', function () {
        updateIncomeKindVisibility();
        var dir = document.getElementById('tx_direction_select');
        if (dir) {
            dir.addEventListener('change', updateIncomeKindVisibility);
        }
    });
</script>
</body>
</html>
