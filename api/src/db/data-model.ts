import type { IPModel } from "./ips.js"
import type { HitModel } from "./hits.js"

export type Data = {
  ips: Record<string, IPModel>
  hits: Record<string, HitModel>
}