// Tiny in-memory stand-in for @supabase/supabase-js.
// Supports just the subset of the query builder that backend/src/services/* uses:
//   from(table).select(cols [, { count, head }]).eq(c, v).in(c, vs).order(c, o)
//   from(table).insert(row|rows).select(cols).single()
//   from(table).update(patch).eq(c, v)[.select(cols).single()]
//   from(table).delete().eq(c, v)
// Builders are awaitable (have `.then`) and also expose `single()` / `maybeSingle()`.
//
// Each fake instance owns a mutable `state.tables` object. Tests call
// `fake.reset({ branches: [...], commits: [...] })` between assertions to get a
// clean fixture.

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

let idCounter = 0;
const nextId = (table) => `${table}-${++idCounter}`;

class QueryBuilder {
  constructor(state, tableName) {
    this.state = state;
    this.tableName = tableName;
    this.mode = "select";
    this.filters = [];
    this.orderBy = [];
    this.countMode = null;
    this.headOnly = false;
    this.insertRows = null;
    this.updatePatch = null;
  }

  select(_cols, opts) {
    if (this.mode === "select") {
      // pure select; capture count/head options
      if (opts && opts.count === "exact") this.countMode = "exact";
      if (opts && opts.head === true) this.headOnly = true;
    }
    // For insert/update chains a trailing .select() just hints "return the row";
    // our fake always returns affected rows, so nothing else to do.
    return this;
  }

  eq(col, val) {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }

  in(col, vals) {
    this.filters.push({ kind: "in", col, vals });
    return this;
  }

  order(col, opts) {
    const ascending = opts ? opts.ascending !== false : true;
    this.orderBy.push({ col, ascending });
    return this;
  }

  insert(rowOrRows) {
    this.mode = "insert";
    this.insertRows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    return this;
  }

  update(patch) {
    this.mode = "update";
    this.updatePatch = patch;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  _table() {
    if (!this.state.tables[this.tableName]) {
      this.state.tables[this.tableName] = [];
    }
    return this.state.tables[this.tableName];
  }

  _matches(row) {
    for (const f of this.filters) {
      if (f.kind === "eq" && row[f.col] !== f.val) return false;
      if (f.kind === "in" && !f.vals.includes(row[f.col])) return false;
    }
    return true;
  }

  _sorted(rows) {
    if (this.orderBy.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const { col, ascending } of this.orderBy) {
        const av = a[col];
        const bv = b[col];
        if (av === bv) continue;
        // null/undefined sorts last regardless of direction (mirrors PG default).
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return ascending ? -1 : 1;
        return ascending ? 1 : -1;
      }
      return 0;
    });
  }

  _execute() {
    const table = this._table();
    if (this.mode === "select") {
      const matched = table.filter((r) => this._matches(r));
      if (this.countMode === "exact" && this.headOnly) {
        return { data: null, error: null, count: matched.length };
      }
      return { data: clone(this._sorted(matched)), error: null };
    }

    if (this.mode === "insert") {
      const inserted = this.insertRows.map((row) => ({
        id: row.id || nextId(this.tableName),
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        ...row,
      }));
      for (const row of inserted) {
        // Mimic the partial unique index "one default branch per project".
        if (this.tableName === "branches" && row.is_default) {
          const conflict = table.find(
            (b) => b.project_id === row.project_id && b.is_default && b.id !== row.id,
          );
          if (conflict) {
            return {
              data: null,
              error: { code: "23505", message: "duplicate default branch" },
            };
          }
        }
        // Mimic the "(project_id, name)" unique on branches.
        if (this.tableName === "branches") {
          const dupName = table.find(
            (b) => b.project_id === row.project_id && b.name === row.name,
          );
          if (dupName) {
            return {
              data: null,
              error: { code: "23505", message: "duplicate branch name" },
            };
          }
        }
        table.push(row);
      }
      return { data: clone(inserted), error: null };
    }

    if (this.mode === "update") {
      const targets = table.filter((r) => this._matches(r));
      for (const row of targets) {
        Object.assign(row, this.updatePatch, { updated_at: new Date().toISOString() });
      }
      return { data: clone(targets), error: null };
    }

    if (this.mode === "delete") {
      const keep = [];
      const removed = [];
      for (const row of table) {
        if (this._matches(row)) removed.push(row);
        else keep.push(row);
      }
      this.state.tables[this.tableName] = keep;
      return { data: clone(removed), error: null };
    }

    return { data: null, error: { message: `Unknown mode ${this.mode}` } };
  }

  async single() {
    const result = this._execute();
    if (result.error) return { data: null, error: result.error };
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row) {
      return { data: null, error: { message: "Not found" } };
    }
    return { data: row, error: null };
  }

  async maybeSingle() {
    const result = this._execute();
    if (result.error) return { data: null, error: result.error };
    const row = Array.isArray(result.data) ? result.data[0] || null : result.data;
    return { data: row, error: null };
  }

  then(onResolve, onReject) {
    return Promise.resolve(this._execute()).then(onResolve, onReject);
  }
}

const createFakeSupabase = () => {
  const state = { tables: {} };
  return {
    from(name) {
      return new QueryBuilder(state, name);
    },
    reset(initial = {}) {
      const cloned = {};
      for (const [name, rows] of Object.entries(initial)) {
        cloned[name] = rows.map((r) => ({ ...r }));
      }
      state.tables = cloned;
    },
    snapshot() {
      return clone(state.tables);
    },
    rows(table) {
      return clone(state.tables[table] || []);
    },
  };
};

module.exports = { createFakeSupabase };
