import type { Collection } from 'mongodb';
import type { TableDef, Field } from '../database/schema';

/** drizzle 兼容操作符 → Mongo 查询条件 */
export interface Cond { type: 'eq' | 'ne' | 'in'; col: Field; val: any; or?: Cond[] }
export interface Order { col: Field; dir: 'asc' | 'desc' }

export const eq = (col: Field, val: any): Cond => ({ type: 'eq', col, val });
export const ne = (col: Field, val: any): Cond => ({ type: 'ne', col, val });
export const inArray = (col: Field, arr: any[]): Cond => ({ type: 'in', col, val: arr });
export function and(...conds: any[]): Cond[] { return conds.flat(); }
export const desc = (col: Field): Order => ({ col, dir: 'desc' });
export const asc = (col: Field): Order => ({ col, dir: 'asc' });

function toFilter(conds: Cond[] | Cond | undefined): Record<string, any> {
  if (!conds) return {};
  const list = Array.isArray(conds) ? conds : [conds];
  const ands = list.filter((c) => c && !Array.isArray(c)).map((c: Cond) => {
    const key = c.col?.key || 'id';
    if (c.type === 'eq') return { [key]: c.val };
    if (c.type === 'ne') return { [key]: { $ne: c.val } };
    if (c.type === 'in') return { [key]: { $in: c.val } };
    return {};
  });
  if (ands.length === 0) return {};
  if (ands.length === 1) return ands[0];
  return { $and: ands };
}

function sortOf(orders: Array<Order | Field> | undefined): Record<string, 1 | -1> {
  const sort: Record<string, 1 | -1> = {};
  if (!orders) return sort;
  for (const o of orders) {
    if (o && 'col' in o && o.col?.key) sort[o.col.key] = o.dir === 'desc' ? -1 : 1;
    else if (o && 'key' in o && (o as Field).key) sort[(o as Field).key] = 1;
  }
  return sort;
}

function withTimestamps(doc: Record<string, any>, isUpdate = false) {
  const now = new Date();
  if (!isUpdate && doc.createdAt == null) doc.createdAt = now;
  if (doc.updatedAt == null) doc.updatedAt = now;
  return doc;
}

class SelectBuilder implements PromiseLike<any[]> {
  private conds: Cond[] = [];
  private orders: Order[] | undefined;
  private limitN: number | undefined;
  constructor(private coll: Collection, private readonly tableName: string) {}
  where(...conds: any[]) { this.conds.push(...conds.flat()); return this; }
  orderBy(...orders: Array<Order | Field>) { this.orders = orders as Order[]; return this; }
  limit(n: number) { this.limitN = n; return this; }
  async run(): Promise<any[]> {
    let q = this.coll.find(toFilter(this.conds));
    if (this.orders?.length) q = q.sort(sortOf(this.orders));
    if (this.limitN != null) q = q.limit(this.limitN);
    return q.toArray();
  }
  then<TResult1 = any[], TResult2 = never>(onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

/** 类 drizzle 的 Mongo 兼容 DB */
export class CompatDb {
  constructor(private readonly mongo: Record<string, Collection>) {}
  private coll(table: TableDef): Collection {
    const c = this.mongo[table.name];
    if (!c) throw new Error(`collection not found: ${table.name}`);
    return c;
  }
  select() {
    return {
      from: (table: TableDef) => new SelectBuilder(this.coll(table), table.name),
    };
  }
  insert(table: TableDef) {
    return {
      values: async (v: Record<string, any>) => {
        await this.coll(table).insertOne(withTimestamps({ ...v }));
        return [];
      },
    };
  }
  update(table: TableDef) {
    return {
      set: (v: Record<string, any>) => ({
        where: async (conds: any) => {
          await this.coll(table).updateOne(toFilter(conds), { $set: withTimestamps({ ...v }, true) });
          return [];
        },
      }),
    };
  }
  delete(table: TableDef) {
    return {
      where: async (conds: any) => {
        await this.coll(table).deleteOne(toFilter(conds));
        return [];
      },
    };
  }
  /** 简化事务：顺序执行（Mongo 单文档原子，跨文档不强求事务） */
  async transaction(cb: (tx: CompatDb) => any) {
    return cb(this);
  }
}
