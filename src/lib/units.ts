import { kgToLb } from "@shared/energy.ts";

export type Units = "metric" | "imperial";
export const fmtWeight = (kg: number | null | undefined, u: Units) =>
  kg == null ? "—" : u === "imperial" ? `${kgToLb(kg)} lb` : `${Math.round(kg * 10) / 10} kg`;
export const fmtVolume = (ml: number, u: Units) =>
  u === "imperial" ? `${Math.round((ml / 29.5735) * 10) / 10} fl oz` : ml >= 1000 ? `${Math.round(ml / 100) / 10} L` : `${ml} ml`;
export const fmtDistance = (m: number | null | undefined, u: Units) =>
  m == null ? null : u === "imperial" ? `${Math.round((m / 1609.34) * 100) / 100} mi` : `${Math.round(m / 10) / 100} km`;
export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);
