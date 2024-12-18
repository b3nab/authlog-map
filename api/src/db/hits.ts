import { db } from './db.js'

export type HitModel = {
  ip: string
  count: number
}

export const getHits = async () => {
  await db.read()
  return db.data.hits
}
export const getHit = async (ip: string) => {
  await db.read()
  return db.data["hits"][ip] ?? undefined
}

export const updateOrCreateHit = async (ip: string, data: HitModel) => {
  await db.read()
  await db.update(({hits}) => hits[ip] = data)
  return data
}