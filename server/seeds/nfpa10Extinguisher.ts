/**
 * NFPA 10 (2022) Portable Fire Extinguisher — Annual Maintenance Checklist.
 *
 * Source of truth for the pre-built NFPA 10 inspection template. Unlike the
 * global CAN/ULC-S536 fire-alarm checklist (which lives in the standard-specific
 * `fire_alarm_checklist_templates` table consumed by `populateJobFireAlarmChecklist`),
 * this seeds the GENERIC per-company template system
 * (`inspection_templates` / `inspection_template_sections` / `inspection_template_items`),
 * because that system is standard-agnostic and already drives the template builder,
 * the `clone` flow, and per-job response capture.
 *
 * The SQL migration `drizzle/migrations/0082_seed_nfpa10_extinguisher_template.sql`
 * is derived from this file and back-fills one copy of the template into every
 * existing company (companyId taken from the parent row, never hardcoded).
 *
 * Field names below mirror the `inspection_template_*` columns:
 *   - template.systemType      → "fire_extinguisher"
 *   - item.itemCode            → letter within the section
 *   - item.questionText        → the pass/fail prompt
 *   - item.responseType        → "pass_fail_na"
 *   - item.codeReference       → the governing NFPA 10 clause
 *   - item.deficiencyTrigger   → { onValues, severity, defaultTitle } consumed by
 *                                the response → auto-deficiency path
 */

export type Severity = "critical" | "major" | "minor" | "observation";

export interface Nfpa10Item {
  itemCode: string;
  questionText: string;
  responseType: "pass_fail_na";
  isRequired: boolean;
  codeReference: string;
  deficiencyTrigger?: {
    onValues: string[];
    severity: Severity;
    defaultTitle: string;
  };
}

export interface Nfpa10Section {
  title: string;
  sortOrder: number;
  description?: string;
  items: Nfpa10Item[];
}

/** A FAIL answer raises a deficiency at the given severity. */
const failTrigger = (severity: Severity, defaultTitle: string) => ({
  onValues: ["fail"],
  severity,
  defaultTitle,
});

export const NFPA10_TEMPLATE = {
  name: "NFPA 10 — Portable Fire Extinguisher (Annual)",
  description:
    "Annual maintenance inspection for portable fire extinguishers per NFPA 10 (2022). Covers placement, physical condition, charge, and service-cadence records (annual / 6-year internal / 12-year hydrostatic).",
  systemType: "fire_extinguisher",
  inspectionType: "annual",
  frequency: "annual",
  sections: [
    {
      title: "Location & Accessibility",
      sortOrder: 0,
      items: [
        {
          itemCode: "A",
          questionText: "Extinguisher is in its designated place, unobstructed, and visible.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §6.1.3",
          deficiencyTrigger: failTrigger("major", "Extinguisher obstructed or not in designated location"),
        },
        {
          itemCode: "B",
          questionText: "Securely mounted on the correct hanger/bracket at the proper installation height.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §6.1.3.8",
          deficiencyTrigger: failTrigger("minor", "Extinguisher not properly mounted"),
        },
        {
          itemCode: "C",
          questionText: "Location signage/marking present and visible where the extinguisher is not in plain view.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §6.1.3.3",
          deficiencyTrigger: failTrigger("minor", "Missing extinguisher location signage"),
        },
      ],
    },
    {
      title: "Physical Condition",
      sortOrder: 1,
      items: [
        {
          itemCode: "A",
          questionText: "Cylinder free of corrosion, dents, or mechanical damage.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §7.2.2",
          deficiencyTrigger: failTrigger("critical", "Cylinder corroded or damaged"),
        },
        {
          itemCode: "B",
          questionText: "Hose, nozzle, and horn intact, attached, and free of obstruction.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §7.2.2",
          deficiencyTrigger: failTrigger("major", "Damaged or obstructed hose/nozzle"),
        },
        {
          itemCode: "C",
          questionText: "Operating-instruction nameplate legible and facing outward.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §6.1.3.6",
          deficiencyTrigger: failTrigger("minor", "Illegible or misfacing instruction nameplate"),
        },
        {
          itemCode: "D",
          questionText: "Tamper seal and safety pin intact.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §7.2.2",
          deficiencyTrigger: failTrigger("major", "Broken tamper seal or missing safety pin"),
        },
      ],
    },
    {
      title: "Charge & Pressure",
      sortOrder: 2,
      items: [
        {
          itemCode: "A",
          questionText: "Pressure gauge (where provided) reads within the operable (green) range.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §7.2.2",
          deficiencyTrigger: failTrigger("critical", "Extinguisher over- or under-pressurized"),
        },
        {
          itemCode: "B",
          questionText: "Fullness confirmed by weighing or hefting.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §7.2.2",
          deficiencyTrigger: failTrigger("critical", "Extinguisher not full / underweight"),
        },
        {
          itemCode: "C",
          questionText: "CO₂ and cartridge-operated units weighed and within manufacturer tolerance.",
          responseType: "pass_fail_na",
          isRequired: false,
          codeReference: "NFPA 10 §7.3.1",
          deficiencyTrigger: failTrigger("major", "CO₂/cartridge weight out of tolerance"),
        },
      ],
    },
    {
      title: "Service Records & Cadence",
      sortOrder: 3,
      items: [
        {
          itemCode: "A",
          questionText: "Annual maintenance tag present, signed, and dated.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §7.3.2",
          deficiencyTrigger: failTrigger("major", "Missing or incomplete annual maintenance tag"),
        },
        {
          itemCode: "B",
          questionText: "6-year internal maintenance current for stored-pressure units.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §7.3.3",
          deficiencyTrigger: failTrigger("major", "6-year internal maintenance overdue"),
        },
        {
          itemCode: "C",
          questionText: "12-year hydrostatic test current.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §8.3.1",
          deficiencyTrigger: failTrigger("critical", "Hydrostatic test overdue"),
        },
        {
          itemCode: "D",
          questionText: "Correct extinguisher type and rating present for the hazard classification.",
          responseType: "pass_fail_na",
          isRequired: true,
          codeReference: "NFPA 10 §5.2 / §5.5",
          deficiencyTrigger: failTrigger("major", "Wrong extinguisher type/rating for hazard"),
        },
      ],
    },
  ] as Nfpa10Section[],
} as const;
