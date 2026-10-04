/**
 * Energy estimates for goal setting. Uses the Mifflin–St Jeor equation, which
 * estimates resting energy for healthy adults only. These are starting points,
 * not prescriptions.
 */

export type Sex = "male" | "female" | "unspecified";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "maintain" | "lose_gradual" | "gain_muscle" | "awareness";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export interface EnergyInput {
  ageYears: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  pregnantOrBreastfeeding?: boolean;
}

export interface EnergyEstimate {
  bmrKcal: number;
  tdeeKcal: number;
  targetKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  warnings: string[];
  requiresClinician: boolean;
  assumptions: string[];
}

export const MIN_TARGET_KCAL = { male: 1500, female: 1200, unspecified: 1350 } as const;

export function ageFromDob(dob: string, today = new Date()): number {
  const d = new Date(dob + "T00:00:00");
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

export function mifflinStJeor(i: Pick<EnergyInput, "ageYears" | "sex" | "heightCm" | "weightKg">): number {
  const base = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.ageYears;
  // For "unspecified" use the midpoint of the two sex constants (+5 / −161).
  const s = i.sex === "male" ? 5 : i.sex === "female" ? -161 : -78;
  return base + s;
}

export function estimateEnergy(i: EnergyInput): EnergyEstimate {
  const warnings: string[] = [];
  const assumptions = [
    "Resting energy estimated with the Mifflin–St Jeor equation.",
    `Activity factor ${ACTIVITY_FACTORS[i.activityLevel]} applied for "${i.activityLevel}".`,
    "Real needs vary by ±10% or more; adjust based on how your weight trends over several weeks.",
  ];
  if (i.heightCm < 100 || i.heightCm > 250) throw new RangeError("Height out of supported range");
  if (i.weightKg < 25 || i.weightKg > 350) throw new RangeError("Weight out of supported range");

  let requiresClinician = false;
  if (i.ageYears < 18) {
    requiresClinician = true;
    warnings.push("Under 18: calorie restriction is not offered. Growing bodies have different needs — please talk to a doctor or registered dietitian.");
  }
  if (i.pregnantOrBreastfeeding) {
    requiresClinician = true;
    warnings.push("Pregnancy/breastfeeding: energy needs change significantly. Weight-loss targets are disabled; please follow your clinician's advice.");
  }
  const bmi = i.weightKg / (i.heightCm / 100) ** 2;
  if (bmi < 18.5) {
    warnings.push("Your BMI is in the underweight range, so weight-loss targets are disabled. Consider speaking with a healthcare professional.");
  }

  const bmr = mifflinStJeor(i);
  const tdee = bmr * ACTIVITY_FACTORS[i.activityLevel];
  let goal = i.goal;
  if (goal === "lose_gradual" && (requiresClinician || bmi < 18.5)) goal = "maintain";

  let target = tdee;
  if (goal === "lose_gradual") target = tdee - Math.min(500, tdee * 0.2); // ≈0.25–0.5 kg/week
  if (goal === "gain_muscle") target = tdee + Math.min(300, tdee * 0.1);

  const floor = MIN_TARGET_KCAL[i.sex];
  if (target < floor && !requiresClinician) {
    warnings.push(`Target raised to ${floor} kcal: lower intakes should only be followed under medical supervision.`);
    target = floor;
  }
  target = Math.round(target / 10) * 10;

  const proteinPerKg = goal === "gain_muscle" ? 1.6 : goal === "lose_gradual" ? 1.4 : 1.0;
  const proteinG = Math.round(Math.min(proteinPerKg * i.weightKg, (target * 0.35) / 4));
  const fatG = Math.round((target * 0.28) / 9);
  const carbsG = Math.max(0, Math.round((target - proteinG * 4 - fatG * 9) / 4));

  return { bmrKcal: Math.round(bmr), tdeeKcal: Math.round(tdee), targetKcal: target, proteinG, carbsG, fatG, warnings, requiresClinician, assumptions };
}

export function defaultWaterTargetMl(weightKg: number): number {
  return Math.min(4000, Math.max(1500, Math.round((weightKg * 33) / 250) * 250));
}

export const kgToLb = (kg: number) => Math.round(kg * 2.20462 * 10) / 10;
export const lbToKg = (lb: number) => Math.round((lb / 2.20462) * 100) / 100;
export const cmToFtIn = (cm: number) => {
  const total = cm / 2.54;
  let ft = Math.floor(total / 12);
  let inch = Math.round(total - ft * 12);
  if (inch === 12) { ft++; inch = 0; }
  return { ft, in: inch };
};
export const ftInToCm = (ft: number, inch: number) => Math.round((ft * 12 + inch) * 2.54 * 10) / 10;
