/**
 * SQLite-backed implementation of {@link ITradeRepository}. The only place SQL
 * runs or snake_case column names exist; maps rows to the camelCase domain
 * model and never leaks row types. Multi-table writes run in one transaction.
 */
import type Database from 'better-sqlite3';
import {
  createTradeId,
  generateTradeId,
  TradeStatus,
  type AuditEntry,
  type AuditInsert,
  type ITradeRepository,
  type NewTrade,
  type Trade,
  type TradeFilters,
  type TradeId,
} from '@trade-blotter/shared';

interface TradeRow {
  id: string;
  symbol: string;
  quantity: number;
  price: number;
  side: string;
  trader: string;
  trade_date: string;
  status: string;
  book: string;
  counterparty: string;
}

interface AuditRow {
  id: number;
  trade_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string;
}

interface MaxIdRow {
  maxId: string | null;
}

const UPDATABLE_COLUMNS: readonly (keyof Trade)[] = [
  'symbol', 'quantity', 'price', 'side', 'trader', 'status', 'book', 'counterparty',
];

export class TradeRepository implements ITradeRepository {
  private readonly stmtFindById: Database.Statement;
  private readonly stmtInsert: Database.Statement;
  private readonly stmtInsertAudit: Database.Statement;
  private readonly stmtCancel: Database.Statement;
  private readonly stmtFindAudit: Database.Statement;
  private readonly stmtFindActive: Database.Statement;
  private readonly stmtFindAllAudit: Database.Statement;

  private nextSequence: number;

  constructor(private readonly db: Database.Database) {
    this.stmtFindById = db.prepare('SELECT * FROM trades WHERE id = ?');
    this.stmtInsert = db.prepare(
      `INSERT INTO trades (id, symbol, quantity, price, side, trader, trade_date, status, book, counterparty)
       VALUES (@id, @symbol, @quantity, @price, @side, @trader, @trade_date, @status, @book, @counterparty)`,
    );
    this.stmtInsertAudit = db.prepare(
      `INSERT INTO trade_audit (trade_id, field, old_value, new_value, changed_at, changed_by)
       VALUES (@trade_id, @field, @old_value, @new_value, @changed_at, @changed_by)`,
    );
    this.stmtCancel = db.prepare('UPDATE trades SET status = @status WHERE id = @id');
    this.stmtFindAudit = db.prepare(
      'SELECT * FROM trade_audit WHERE trade_id = ? ORDER BY changed_at DESC, id DESC',
    );
    this.stmtFindActive = db.prepare(`SELECT * FROM trades WHERE status = '${TradeStatus.ACTIVE}'`);
    this.stmtFindAllAudit = db.prepare(
      'SELECT * FROM trade_audit ORDER BY changed_at DESC, id DESC LIMIT ?',
    );

    this.nextSequence = this.computeStartSequence();
  }

  private rowToTrade(row: TradeRow): Readonly<Trade> {
    return {
      id: createTradeId(row.id),
      symbol: row.symbol,
      quantity: row.quantity,
      price: row.price,
      side: row.side as Trade['side'],
      trader: row.trader,
      tradeDate: row.trade_date,
      status: row.status as Trade['status'],
      book: row.book,
      counterparty: row.counterparty,
    };
  }

  private rowToAuditEntry(row: AuditRow): AuditEntry {
    return {
      id: row.id,
      tradeId: createTradeId(row.trade_id),
      field: row.field,
      oldValue: row.old_value,
      newValue: row.new_value,
      changedAt: row.changed_at,
      changedBy: row.changed_by,
    };
  }

  private computeStartSequence(): number {
    const row = this.db.prepare('SELECT MAX(id) AS maxId FROM trades').get() as MaxIdRow;
    if (row.maxId === null) {
      return 100001;
    }
    const numeric = Number(row.maxId.slice('TRD-'.length));
    return Number.isFinite(numeric) ? numeric + 1 : 100001;
  }

  findAll(filters?: TradeFilters): Trade[] {
    const clauses: string[] = [];
    const params: string[] = [];

    if (filters?.symbol !== undefined) {
      clauses.push('UPPER(symbol) = UPPER(?)');
      params.push(filters.symbol);
    }
    if (filters?.side !== undefined) {
      clauses.push('side = ?');
      params.push(filters.side);
    }
    if (filters?.status !== undefined) {
      clauses.push('status = ?');
      params.push(filters.status);
    }
    if (filters?.trader !== undefined) {
      clauses.push('trader = ?');
      params.push(filters.trader);
    }

    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    // Newest-first at the source so page 1 is the latest trades.
    const sql = `SELECT * FROM trades${where} ORDER BY trade_date DESC, id DESC`;
    const rows = this.db.prepare(sql).all(...params) as TradeRow[];
    return rows.map((row) => this.rowToTrade(row));
  }

  findById(id: TradeId): Trade | null {
    const row = this.stmtFindById.get(id) as TradeRow | undefined;
    return row ? this.rowToTrade(row) : null;
  }

  create(trade: NewTrade): Trade {
    const id = generateTradeId(this.nextSequence);
    this.nextSequence += 1;
    const tradeDate = new Date().toISOString();
    this.stmtInsert.run({
      id,
      symbol: trade.symbol,
      quantity: trade.quantity,
      price: trade.price,
      side: trade.side,
      trader: trade.trader,
      trade_date: tradeDate,
      status: TradeStatus.ACTIVE,
      book: trade.book,
      counterparty: trade.counterparty,
    });
    const inserted = this.stmtFindById.get(id) as TradeRow;
    return this.rowToTrade(inserted);
  }

  update(id: TradeId, fields: Partial<Trade>, auditEntries: AuditInsert[]): Trade {
    const setColumns: string[] = [];
    const setValues: Record<string, string | number> = {};

    for (const column of UPDATABLE_COLUMNS) {
      const value = fields[column];
      if (value !== undefined) {
        setColumns.push(`${column} = @${column}`);
        setValues[column] = value as string | number;
      }
    }

    const runUpdate = this.db.transaction(() => {
      const existing = this.stmtFindById.get(id) as TradeRow | undefined;
      if (existing === undefined) {
        throw new Error(`Trade ${id} not found`);
      }
      if (setColumns.length > 0) {
        const sql = `UPDATE trades SET ${setColumns.join(', ')} WHERE id = @id`;
        this.db.prepare(sql).run({ ...setValues, id });
      }
      for (const entry of auditEntries) {
        this.stmtInsertAudit.run({
          trade_id: entry.tradeId,
          field: entry.field,
          old_value: entry.oldValue,
          new_value: entry.newValue,
          changed_at: entry.changedAt,
          changed_by: entry.changedBy,
        });
      }
    });

    runUpdate();
    const updated = this.stmtFindById.get(id) as TradeRow;
    return this.rowToTrade(updated);
  }

  cancel(id: TradeId): Trade {
    const changedAt = new Date().toISOString();
    const runCancel = this.db.transaction(() => {
      const existing = this.stmtFindById.get(id) as TradeRow | undefined;
      if (existing === undefined) {
        throw new Error(`Trade ${id} not found`);
      }
      this.stmtCancel.run({ status: TradeStatus.CANCELLED, id });
      this.stmtInsertAudit.run({
        trade_id: id,
        field: 'status',
        old_value: existing.status,
        new_value: TradeStatus.CANCELLED,
        changed_at: changedAt,
        changed_by: 'SYSTEM',
      });
    });
    runCancel();
    const cancelled = this.stmtFindById.get(id) as TradeRow;
    return this.rowToTrade(cancelled);
  }

  findAuditHistory(tradeId: TradeId): AuditEntry[] {
    const rows = this.stmtFindAudit.all(tradeId) as AuditRow[];
    return rows.map((row) => this.rowToAuditEntry(row));
  }

  findAllAuditEntries(limit: number): AuditEntry[] {
    const rows = this.stmtFindAllAudit.all(limit) as AuditRow[];
    return rows.map((row) => this.rowToAuditEntry(row));
  }

  getActiveTrades(): Trade[] {
    const rows = this.stmtFindActive.all() as TradeRow[];
    return rows.map((row) => this.rowToTrade(row));
  }
}
