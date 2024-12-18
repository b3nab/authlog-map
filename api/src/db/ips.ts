import { db } from './db.js'

export type IPModel = {
  ip: string
  continent_code: string
  country_code: string
  city: string
  lat: string | number
  lng: string | number
  isp: string
}

export const getIPs = async () => {
  await db.read()
  return db.data.ips
}
export const getIP = async (ip: string) => {
  await db.read()
  return db.data["ips"][ip] ?? undefined
}

export const updateOrCreateIP = async (ip: string, data: IPModel) => {
  await db.read()
  await db.update(({ips}) => ips[ip] = data)
  return data
}