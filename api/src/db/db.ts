import { JSONFilePreset } from 'lowdb/node'
import type { Data } from './data-model.js'

// Read or create db.json
const defaultData: Data = {
  "ips": {},
  "hits": {}
}
export const db = await JSONFilePreset<Data>(process.env.DBJSON ?? '/app/db.json', defaultData)