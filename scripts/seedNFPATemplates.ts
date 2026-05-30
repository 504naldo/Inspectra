/**
 * scripts/seedNFPATemplates.ts
 *
 * Seeds pre-built NFPA / ULC inspection templates for a company.
 * Templates are marked active and assigned a default system-type assignment so
 * they appear automatically on jobs of the matching type.
 *
 * Safe to re-run — existing templates with the same name are skipped.
 *
 * Usage:
 *   DATABASE_URL=mysql://... npx tsx scripts/seedNFPATemplates.ts --company 1
 *   DATABASE_URL=mysql://... npx tsx scripts/seedNFPATemplates.ts --company 1 --dry-run
 */

import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });

// ─── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const companyId = (() => {
  const idx = args.indexOf("--company");
  return idx !== -1 ? parseInt(args[idx + 1], 10) : NaN;
})();
const dryRun = args.includes("--dry-run");

if (isNaN(companyId)) {
  console.error("Usage: tsx scripts/seedNFPATemplates.ts --company <id> [--dry-run]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// ─── DB ────────────────────────────────────────────────────────────────────────
const db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });

// ─── Template definitions ──────────────────────────────────────────────────────

type ResponseType =
  | "pass_fail_na" | "yes_no_na" | "text" | "number" | "date"
  | "select" | "multi_select" | "checkbox" | "pressure_reading" | "time_duration";

type DeficiencyTrigger = {
  onValues: string[];
  severity: "critical" | "major" | "minor" | "observation";
  defaultTitle?: string;
};

type ItemDef = {
  itemCode?: string;
  questionText: string;
  helpText?: string;
  responseType: ResponseType;
  isRequired?: boolean;
  codeReference?: string;
  deficiencyTrigger?: DeficiencyTrigger;
  options?: string[];
};

type SectionDef = {
  title: string;
  description?: string;
  items: ItemDef[];
};

type TemplateDef = {
  name: string;
  description: string;
  systemType: string;
  inspectionType: string;
  frequency: string;
  defaultAssignmentSystemType?: string;
  defaultAssignmentJobType?: string;
  sections: SectionDef[];
};

const TEMPLATES: TemplateDef[] = [

  // ─── ULC S536 / NFPA 72 — Fire Alarm Annual ──────────────────────────────────
  {
    name: "ULC S536 / NFPA 72 — Fire Alarm Annual Inspection",
    description: "Annual inspection and testing of fire alarm systems per ULC S536 (Canada) and NFPA 72. Covers FACP, initiating devices, notification appliances, power supplies, signal transmission, and ancillary control functions.",
    systemType: "fire_alarm",
    inspectionType: "annual",
    frequency: "annual",
    defaultAssignmentSystemType: "fire_alarm",
    defaultAssignmentJobType: "annual",
    sections: [
      {
        title: "General Information",
        description: "Record site and system information before beginning the inspection.",
        items: [
          { itemCode: "G.1", questionText: "System manufacturer and model number recorded?", responseType: "text", isRequired: false, helpText: "Note the FACP make, model, and firmware/software version." },
          { itemCode: "G.2", questionText: "Date of last annual inspection", responseType: "date", isRequired: false },
          { itemCode: "G.3", questionText: "Number of initiating device circuits (IDC/SLC zones)", responseType: "number", isRequired: false },
          { itemCode: "G.4", questionText: "Central station / monitoring company", responseType: "text", isRequired: false },
          { itemCode: "G.5", questionText: "Sprinkler system connected to FACP?", responseType: "yes_no_na", codeReference: "NFPA 72 §21.4" },
        ],
      },
      {
        title: "Control Equipment (FACP)",
        description: "Inspect and test the fire alarm control panel and all control functions.",
        items: [
          { itemCode: "CE.1", questionText: "FACP is free of trouble conditions at start of inspection", responseType: "pass_fail_na", codeReference: "ULC S536 §5.2 / NFPA 72 §14.4.2", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "FACP trouble condition present at start of inspection" }, helpText: "Document any pre-existing troubles in notes before proceeding." },
          { itemCode: "CE.2", questionText: "FACP is free of supervisory signals at start of inspection", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.2", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "FACP supervisory signal present at inspection start" } },
          { itemCode: "CE.3", questionText: "All lamps/LEDs functional (lamp test)", responseType: "pass_fail_na", codeReference: "ULC S536 §6.2.1", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "FACP lamp/LED failure" } },
          { itemCode: "CE.4", questionText: "Control panel enclosure and wiring free of damage", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.2", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "FACP enclosure or wiring damage observed" } },
          { itemCode: "CE.5", questionText: "FACP displays correct time and date", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.2", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "FACP time/date incorrect" } },
          { itemCode: "CE.6", questionText: "Event log reviewed and unusual events noted", responseType: "checkbox", helpText: "Review history for unreported alarms, restores, or repeated trouble events." },
          { itemCode: "CE.7", questionText: "Software/firmware version recorded", responseType: "text", isRequired: false },
        ],
      },
      {
        title: "Initiating Devices",
        description: "Functional test of all initiating devices. Each device type should be tested per applicable frequency requirements.",
        items: [
          { itemCode: "ID.1", questionText: "Smoke detector sensitivity tested (within required range)", responseType: "pass_fail_na", codeReference: "ULC S529 / NFPA 72 §14.4.5", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Smoke detector sensitivity out of range" }, helpText: "Use listed calibrated test equipment. Sensitivity must be within UL/FM listed range." },
          { itemCode: "ID.2", questionText: "All smoke detectors respond to test (functional test)", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.5.2", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Smoke detector failed functional test" } },
          { itemCode: "ID.3", questionText: "Heat detectors — functional test completed", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.6", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Heat detector failed functional test" } },
          { itemCode: "ID.4", questionText: "Manual pull stations — functional test completed", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.7", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Manual pull station failed functional test" } },
          { itemCode: "ID.5", questionText: "Duct smoke detectors — functional test completed (if present)", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.5.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Duct smoke detector failed functional test" } },
          { itemCode: "ID.6", questionText: "Waterflow switches — functional test completed (if present)", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.9", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Waterflow switch failed functional test" } },
          { itemCode: "ID.7", questionText: "Tamper/supervisory switches — functional test (if present)", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.8", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Tamper switch failed functional test" } },
          { itemCode: "ID.8", questionText: "CO detectors — functional test (if integrated)", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.5", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "CO detector failed functional test" } },
          { itemCode: "ID.9", questionText: "Total initiating devices tested", responseType: "number", isRequired: false, helpText: "Record total count of devices tested this visit." },
        ],
      },
      {
        title: "Notification Appliances",
        description: "Test all audible and visual notification appliances.",
        items: [
          { itemCode: "NA.1", questionText: "Audible appliances (horns/buzzers) tested — audible throughout occupied areas", responseType: "pass_fail_na", codeReference: "ULC S536 §6.7 / NFPA 72 §14.4.9", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Audible notification appliance failed test" } },
          { itemCode: "NA.2", questionText: "Visual appliances (strobes) tested — visible throughout designated areas", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.9", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Visual (strobe) notification appliance failed test" } },
          { itemCode: "NA.3", questionText: "Voice/speaker evacuation system tested (if present)", responseType: "pass_fail_na", codeReference: "NFPA 72 §24.4", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Voice evacuation system failed test" } },
          { itemCode: "NA.4", questionText: "Appliances are free of damage, paint, or obstruction", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.9", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Notification appliance obstructed or damaged" } },
          { itemCode: "NA.5", questionText: "Total notification appliances tested", responseType: "number", isRequired: false },
        ],
      },
      {
        title: "Power Supply",
        description: "Verify primary and secondary (battery) power supply condition.",
        items: [
          { itemCode: "PS.1", questionText: "Primary AC power present and correct voltage", responseType: "pass_fail_na", codeReference: "NFPA 72 §10.5.3", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Primary AC power absent or incorrect voltage" } },
          { itemCode: "PS.2", questionText: "Primary voltage reading (VAC)", responseType: "pressure_reading", isRequired: false, helpText: "Use multimeter at FACP terminal block." },
          { itemCode: "PS.3", questionText: "Batteries — no swelling, cracking, or leakage", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.4", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Battery physical defect — replacement required" } },
          { itemCode: "PS.4", questionText: "Battery load test passed (maintains rated voltage under load)", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.4", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Battery load test failed — replacement recommended" } },
          { itemCode: "PS.5", questionText: "Battery age (years)", responseType: "number", isRequired: false, helpText: "Most batteries require replacement every 3–5 years." },
          { itemCode: "PS.6", questionText: "24-hour standby capacity verified (or 4-hour for certain occupancies)", responseType: "pass_fail_na", codeReference: "NFPA 72 §10.6.7" },
          { itemCode: "PS.7", questionText: "Generator or other auxiliary power tested (if present)", responseType: "pass_fail_na", codeReference: "NFPA 110", isRequired: false },
        ],
      },
      {
        title: "Signal Transmission & Monitoring",
        description: "Verify that alarm, supervisory, and trouble signals are received by the monitoring centre.",
        items: [
          { itemCode: "ST.1", questionText: "Alarm signal transmitted to and acknowledged by central station", responseType: "pass_fail_na", codeReference: "ULC S561 / NFPA 72 §26.4", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Alarm signal not received by central station" } },
          { itemCode: "ST.2", questionText: "Supervisory signal transmitted and acknowledged", responseType: "pass_fail_na", codeReference: "NFPA 72 §26.4", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Supervisory signal not received by central station" } },
          { itemCode: "ST.3", questionText: "Trouble signal transmitted and acknowledged", responseType: "pass_fail_na", codeReference: "NFPA 72 §26.4", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Trouble signal not received by central station" } },
          { itemCode: "ST.4", questionText: "Restore signal transmitted after alarm test", responseType: "pass_fail_na", codeReference: "NFPA 72 §26.4", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Restore signal not received by central station" } },
          { itemCode: "ST.5", questionText: "Central station account number and contact confirmed current", responseType: "checkbox", isRequired: false },
        ],
      },
      {
        title: "Ancillary Control Functions",
        description: "Verify that all secondary fire alarm functions operate correctly on alarm.",
        items: [
          { itemCode: "AC.1", questionText: "Elevator recall — Phase 1 recall tested (if integrated)", responseType: "pass_fail_na", codeReference: "NFPA 72 §21.3 / CAN/CSA-B44", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Elevator recall failed on alarm activation" } },
          { itemCode: "AC.2", questionText: "HVAC shutdown — air handlers shut down on alarm (if integrated)", responseType: "pass_fail_na", codeReference: "NFPA 72 §21.7", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "HVAC system did not shut down on fire alarm" } },
          { itemCode: "AC.3", questionText: "Magnetic door holders release on alarm", responseType: "pass_fail_na", codeReference: "NFPA 72 §21.6", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Door holder did not release on alarm" } },
          { itemCode: "AC.4", questionText: "Fire suppression system release (Halon/CO2/FM-200) — supervised (if present)", responseType: "pass_fail_na", isRequired: false, codeReference: "NFPA 72 §21.4" },
          { itemCode: "AC.5", questionText: "Stairwell pressurization activated (if present)", responseType: "pass_fail_na", isRequired: false, codeReference: "NFPA 72 §21.8" },
          { itemCode: "AC.6", questionText: "Smoke dampers close on alarm (if present)", responseType: "pass_fail_na", isRequired: false, codeReference: "NFPA 72 §21.7" },
        ],
      },
      {
        title: "Final Documentation",
        items: [
          { itemCode: "FD.1", questionText: "All deficiencies identified during this inspection communicated to building owner/representative", responseType: "checkbox" },
          { itemCode: "FD.2", questionText: "System returned to full normal operation after testing", responseType: "checkbox" },
          { itemCode: "FD.3", questionText: "Central station notified system is back in service", responseType: "checkbox" },
          { itemCode: "FD.4", questionText: "Inspection tag/label updated on FACP", responseType: "checkbox" },
          { itemCode: "FD.5", questionText: "Additional notes / observations", responseType: "text", isRequired: false },
        ],
      },
    ],
  },

  // ─── NFPA 25 — Sprinkler / Water-Based Annual ITM ────────────────────────────
  {
    name: "NFPA 25 — Sprinkler System Annual ITM",
    description: "Annual inspection, testing, and maintenance of water-based fire protection systems per NFPA 25. Covers control valves, gauges, sprinklers, pipe condition, alarm devices, and waterflow testing.",
    systemType: "sprinkler",
    inspectionType: "annual",
    frequency: "annual",
    defaultAssignmentSystemType: "sprinkler",
    defaultAssignmentJobType: "annual",
    sections: [
      {
        title: "General System Information",
        items: [
          { itemCode: "GS.1", questionText: "System type", responseType: "select", options: ["Wet Pipe", "Dry Pipe", "Pre-action", "Deluge", "Combined Dry/Pre-action"], isRequired: false },
          { itemCode: "GS.2", questionText: "Number of sprinkler heads (approx.)", responseType: "number", isRequired: false },
          { itemCode: "GS.3", questionText: "Date of last 5-year internal obstruction investigation", responseType: "date", isRequired: false, codeReference: "NFPA 25 §14.3" },
          { itemCode: "GS.4", questionText: "Fire department connection (FDC) accessible and caps in place", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.7", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "FDC inaccessible or caps missing" } },
        ],
      },
      {
        title: "Control Valves",
        description: "All control valves must be fully open, properly supervised, and accessible.",
        items: [
          { itemCode: "CV.1", questionText: "All control valves fully open and in correct position", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.3.2", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Control valve not fully open — system impairment" } },
          { itemCode: "CV.2", questionText: "Control valves are locked, sealed, or electronically supervised", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.3.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Control valve not supervised (unsealed/unlocked)" } },
          { itemCode: "CV.3", questionText: "OS&Y valve stem lubricated and moves freely", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.3.4", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "OS&Y valve requires lubrication or is obstructed" } },
          { itemCode: "CV.4", questionText: "Check valves free of leakage (clapper verified operational)", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.4.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Check valve leakage detected" } },
          { itemCode: "CV.5", questionText: "Dry pipe valve / pre-action valve in set position (if applicable)", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.4.3", isRequired: false, deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Dry pipe / pre-action valve not in set position" } },
        ],
      },
      {
        title: "Gauges & System Pressure",
        items: [
          { itemCode: "GP.1", questionText: "System pressure gauge reading (PSI or kPa)", responseType: "pressure_reading", codeReference: "NFPA 25 §13.2.2" },
          { itemCode: "GP.2", questionText: "System pressure within normal operating range", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.2.2", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "System pressure out of normal range" } },
          { itemCode: "GP.3", questionText: "Air pressure gauge reading on dry/pre-action system (if applicable)", responseType: "pressure_reading", isRequired: false, codeReference: "NFPA 25 §13.2.3" },
          { itemCode: "GP.4", questionText: "All gauges within calibration date (replaced or calibrated every 5 years)", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.2.7", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Pressure gauge requires calibration or replacement" } },
        ],
      },
      {
        title: "Sprinkler Heads & Spacing",
        items: [
          { itemCode: "SP.1", questionText: "Sprinkler heads free of corrosion, loading, paint, or physical damage", responseType: "pass_fail_na", codeReference: "NFPA 25 §5.2.1.1", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Sprinkler head corrosion/paint/damage — replacement required" } },
          { itemCode: "SP.2", questionText: "Minimum 18\" clearance maintained below all sprinkler heads", responseType: "pass_fail_na", codeReference: "NFPA 25 §5.2.1.2", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Sprinkler clearance obstruction — minimum 18\" not maintained" } },
          { itemCode: "SP.3", questionText: "No spare sprinkler heads or wrench missing from cabinet", responseType: "pass_fail_na", codeReference: "NFPA 25 §5.2.5", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Spare sprinkler cabinet incomplete — heads or wrench missing" } },
          { itemCode: "SP.4", questionText: "Sprinkler heads installed date within replacement interval (50-year standard; 75-year fast-response)", responseType: "pass_fail_na", codeReference: "NFPA 25 §5.4.1", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Sprinkler heads past replacement interval" }, helpText: "Standard response heads ≥50 years, fast-response ≥75 years require replacement or sample testing." },
          { itemCode: "SP.5", questionText: "Concealed / recessed / decorative sprinkler cover plates and escutcheons in place", responseType: "pass_fail_na", codeReference: "NFPA 25 §5.2.1", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Sprinkler cover plate or escutcheon missing" } },
        ],
      },
      {
        title: "Pipe, Fittings & Hangers",
        items: [
          { itemCode: "PF.1", questionText: "Pipe free of external corrosion, mechanical damage, or leaks", responseType: "pass_fail_na", codeReference: "NFPA 25 §14.2.1", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Pipe corrosion, damage, or active leak observed" } },
          { itemCode: "PF.2", questionText: "Pipe hangers and supports secure and undamaged", responseType: "pass_fail_na", codeReference: "NFPA 25 §14.2.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Pipe hanger loose or damaged" } },
          { itemCode: "PF.3", questionText: "No unauthorized branch lines, tees, or connections added", responseType: "pass_fail_na", codeReference: "NFPA 25 §14.2", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Unauthorized pipe modification detected" } },
          { itemCode: "PF.4", questionText: "Anti-freeze loop concentration checked (if applicable)", responseType: "pass_fail_na", codeReference: "NFPA 25 §5.3.4", isRequired: false, helpText: "Use refractometer. Concentration must match system design." },
        ],
      },
      {
        title: "Alarm Devices & Waterflow Test",
        items: [
          { itemCode: "AD.1", questionText: "Main drain test conducted — residual pressure recorded", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.2.4", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Main drain test failed or pressure lower than baseline" } },
          { itemCode: "AD.2", questionText: "Main drain residual pressure (PSI or kPa)", responseType: "pressure_reading", isRequired: false, helpText: "Compare to previous test record. Significant drop indicates obstruction." },
          { itemCode: "AD.3", questionText: "Waterflow alarm activated within 90 seconds of flow", responseType: "pass_fail_na", codeReference: "NFPA 25 §5.3.3", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Waterflow alarm not activated within 90-second requirement" } },
          { itemCode: "AD.4", questionText: "Flow switch signal received at FACP", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.9", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Waterflow switch signal not received at FACP" } },
          { itemCode: "AD.5", questionText: "Waterflow signal received at central station", responseType: "pass_fail_na", codeReference: "NFPA 25 §5.3.3", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Waterflow signal not received by central station monitoring" } },
          { itemCode: "AD.6", questionText: "Water motor gong or electric bell operational (if present)", responseType: "pass_fail_na", codeReference: "NFPA 25 §5.3.3", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Water motor gong or local alarm bell non-functional" } },
        ],
      },
      {
        title: "Backflow Prevention",
        items: [
          { itemCode: "BF.1", questionText: "Backflow preventer present, accessible, and labelled", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.6", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Backflow preventer inaccessible or missing label" } },
          { itemCode: "BF.2", questionText: "Annual backflow test completed by certified tester (certificate on file)", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.6", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Backflow preventer annual test not completed" } },
        ],
      },
      {
        title: "Fire Pump (if present)",
        items: [
          { itemCode: "FP.1", questionText: "Fire pump is present at this location", responseType: "yes_no_na" },
          { itemCode: "FP.2", questionText: "Weekly churn test records current (automatic weekly start)", responseType: "pass_fail_na", codeReference: "NFPA 25 §8.3.1", isRequired: false, deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Fire pump weekly churn test records not current" } },
          { itemCode: "FP.3", questionText: "Annual flow test completed and flow curves within acceptable range", responseType: "pass_fail_na", codeReference: "NFPA 25 §8.3.3", isRequired: false, deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Fire pump annual flow test failed — capacity below design" } },
          { itemCode: "FP.4", questionText: "Pump room / enclosure heated and maintained above 40°F (4°C)", responseType: "pass_fail_na", codeReference: "NFPA 20 §4.12", isRequired: false, deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Fire pump room temperature below minimum" } },
        ],
      },
      {
        title: "Final Documentation",
        items: [
          { itemCode: "FD.1", questionText: "All deficiencies communicated to building owner/representative", responseType: "checkbox" },
          { itemCode: "FD.2", questionText: "System returned to full service after testing", responseType: "checkbox" },
          { itemCode: "FD.3", questionText: "Monitoring company notified system is back in service", responseType: "checkbox" },
          { itemCode: "FD.4", questionText: "Additional notes / observations", responseType: "text", isRequired: false },
        ],
      },
    ],
  },

  // ─── NFPA 10 — Fire Extinguisher Annual ──────────────────────────────────────
  {
    name: "NFPA 10 — Portable Fire Extinguisher Annual Inspection",
    description: "Annual inspection of portable fire extinguishers per NFPA 10. Documents location, physical condition, operating readiness, and service certification status.",
    systemType: "fire_extinguisher",
    inspectionType: "annual",
    frequency: "annual",
    defaultAssignmentSystemType: "fire_extinguisher",
    defaultAssignmentJobType: "annual",
    sections: [
      {
        title: "Location & Accessibility",
        items: [
          { itemCode: "LA.1", questionText: "Extinguisher mounted in designated location", responseType: "pass_fail_na", codeReference: "NFPA 10 §7.1.2", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Extinguisher not in designated mounting location" } },
          { itemCode: "LA.2", questionText: "Extinguisher visible and unobstructed", responseType: "pass_fail_na", codeReference: "NFPA 10 §7.1.3", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Extinguisher visibility obstructed" } },
          { itemCode: "LA.3", questionText: "Mounting height ≤ 5 ft (1.5 m) to handle for units ≤ 40 lb; ≤ 3.5 ft for heavier units", responseType: "pass_fail_na", codeReference: "NFPA 10 §7.1.4", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Extinguisher mounted at incorrect height" } },
          { itemCode: "LA.4", questionText: "Appropriate class/type for hazard in area", responseType: "pass_fail_na", codeReference: "NFPA 10 §6.2", helpText: "Class A: ordinary combustibles. Class B: flammable liquids. Class C: energized equipment. Class D: combustible metals. Class K: cooking oils.", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Extinguisher class inappropriate for area hazard" } },
        ],
      },
      {
        title: "External Condition & Readiness",
        items: [
          { itemCode: "EC.1", questionText: "No dents, corrosion, or physical damage to shell", responseType: "pass_fail_na", codeReference: "NFPA 10 §7.4.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Extinguisher shell physically damaged — remove from service" } },
          { itemCode: "EC.2", questionText: "Discharge nozzle/hose free of obstruction or damage", responseType: "pass_fail_na", codeReference: "NFPA 10 §7.4.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Discharge nozzle/hose obstructed or damaged" } },
          { itemCode: "EC.3", questionText: "Pressure gauge in operable (green) range", responseType: "pass_fail_na", codeReference: "NFPA 10 §7.4.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Extinguisher pressure gauge not in operable range — recharge required" } },
          { itemCode: "EC.4", questionText: "Pull pin present, undamaged, and properly secured", responseType: "pass_fail_na", codeReference: "NFPA 10 §7.4.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Pull pin missing or damaged" } },
          { itemCode: "EC.5", questionText: "Tamper seal / tamper indicator intact", responseType: "pass_fail_na", codeReference: "NFPA 10 §7.4.3", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Tamper seal missing or broken — may have been discharged" } },
          { itemCode: "EC.6", questionText: "Operating instructions legible (front of unit)", responseType: "pass_fail_na", codeReference: "NFPA 10 §7.4.3", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Operating instructions not legible" } },
          { itemCode: "EC.7", questionText: "Weight within acceptable limits (CO2 or stored-pressure units)", responseType: "pass_fail_na", isRequired: false, codeReference: "NFPA 10 §7.4.3", helpText: "CO2 cylinders must be weighed. Loss of >10% of weight requires recharge." },
        ],
      },
      {
        title: "Service Records & Certification",
        items: [
          { itemCode: "SR.1", questionText: "Annual inspection tag present and current year", responseType: "pass_fail_na", codeReference: "NFPA 10 §7.4.3", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Annual inspection tag missing or not current" } },
          { itemCode: "SR.2", questionText: "6-year internal examination required? (dry chemical ≥ 6 years since last)", responseType: "yes_no_na", codeReference: "NFPA 10 §7.6", helpText: "Required every 6 years for stored-pressure dry chemical units." },
          { itemCode: "SR.3", questionText: "6-year internal examination completed (if required above)", responseType: "pass_fail_na", isRequired: false, codeReference: "NFPA 10 §7.6", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "6-year internal examination overdue" } },
          { itemCode: "SR.4", questionText: "Hydrostatic test required? (per NFPA 10 Table 8.3.1 intervals)", responseType: "yes_no_na", codeReference: "NFPA 10 §8", helpText: "Most shells: 12-year interval. CO2: 5-year. Check Table 8.3.1 for specific type." },
          { itemCode: "SR.5", questionText: "Hydrostatic test completed and date stamped on shell (if required)", responseType: "pass_fail_na", isRequired: false, codeReference: "NFPA 10 §8.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Hydrostatic test overdue — unit must be removed from service" } },
        ],
      },
    ],
  },

  // ─── NFPA 80 — Fire Door Annual Inspection ───────────────────────────────────
  {
    name: "NFPA 80 — Fire Door Assembly Annual Inspection",
    description: "Annual inspection and testing of fire door assemblies per NFPA 80. Covers door leaf, frame, hardware, closing mechanisms, seals, glazing, and hold-open devices.",
    systemType: "general",
    inspectionType: "annual",
    frequency: "annual",
    defaultAssignmentJobType: "annual",
    sections: [
      {
        title: "Door Leaf Condition",
        items: [
          { itemCode: "DL.1", questionText: "Door leaf free of holes, breaks, or burn-through", responseType: "pass_fail_na", codeReference: "NFPA 80 §5.2.1.3", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Fire door leaf has hole, break, or penetration" } },
          { itemCode: "DL.2", questionText: "UL / certification label present and legible on door leaf", responseType: "pass_fail_na", codeReference: "NFPA 80 §5.2.1.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Fire door label missing or illegible" } },
          { itemCode: "DL.3", questionText: "Door closes fully from any open position without sticking or binding", responseType: "pass_fail_na", codeReference: "NFPA 80 §5.2.1.3.2", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Fire door does not close fully — latching failure" } },
          { itemCode: "DL.4", questionText: "Door latches fully in closed position", responseType: "pass_fail_na", codeReference: "NFPA 80 §5.2.1.3.3", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Fire door latch does not engage — door does not latch" } },
        ],
      },
      {
        title: "Frame, Hardware & Closing Device",
        items: [
          { itemCode: "FH.1", questionText: "Door frame free of damage and securely anchored to wall", responseType: "pass_fail_na", codeReference: "NFPA 80 §5.1.7", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Fire door frame damaged or loose from wall" } },
          { itemCode: "FH.2", questionText: "All hinges present, secured, and functional", responseType: "pass_fail_na", codeReference: "NFPA 80 §5.2.1.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Fire door hinge missing, loose, or non-functional" } },
          { itemCode: "FH.3", questionText: "Door closer installed and functioning (no missing closer)", responseType: "pass_fail_na", codeReference: "NFPA 80 §5.2.1.3.4", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Fire door closer missing or non-functional" } },
          { itemCode: "FH.4", questionText: "Coordinator (if present) sequences doors correctly on double-leaf assemblies", responseType: "pass_fail_na", isRequired: false, codeReference: "NFPA 80 §5.2.1.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Double-door coordinator not sequencing correctly" } },
          { itemCode: "FH.5", questionText: "Latchbolt/deadbolt hardware is listed fire-rated hardware", responseType: "pass_fail_na", codeReference: "NFPA 80 §5.2.1.3", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Non-rated hardware installed on fire door" } },
        ],
      },
      {
        title: "Seals, Gaskets & Clearances",
        items: [
          { itemCode: "SG.1", questionText: "Intumescent seals / smoke seals intact and in place around door perimeter", responseType: "pass_fail_na", codeReference: "NFPA 80 §5.2.1.3.1", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Intumescent or smoke seal missing or damaged" } },
          { itemCode: "SG.2", questionText: "Door undercut clearance ≤ 3/4\" (19 mm) at sill", responseType: "pass_fail_na", codeReference: "NFPA 80 §4.8.4", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Fire door undercut exceeds 3/4\" maximum" } },
          { itemCode: "SG.3", questionText: "Maximum clearances around door perimeter maintained (≤ 1/8\" at head/jamb; ≤ 3/4\" between double doors)", responseType: "pass_fail_na", codeReference: "NFPA 80 §4.8", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Fire door clearance exceeds maximum allowed" } },
          { itemCode: "SG.4", questionText: "Threshold / door sweep present (if required by assembly listing)", responseType: "pass_fail_na", isRequired: false, codeReference: "NFPA 80 §5.2.1.3" },
        ],
      },
      {
        title: "Glazing & Accessories",
        items: [
          { itemCode: "GL.1", questionText: "Fire-rated glazing intact — no cracks, chips, or replacement with non-rated glass", responseType: "pass_fail_na", isRequired: false, codeReference: "NFPA 80 §5.8", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Fire-rated glazing cracked, chipped, or replaced with non-rated glass" } },
          { itemCode: "GL.2", questionText: "Vision panel frame and retaining clips/beads secured", responseType: "pass_fail_na", isRequired: false, codeReference: "NFPA 80 §5.8", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Vision panel frame loose or clips missing" } },
          { itemCode: "GL.3", questionText: "No field-cut openings or modifications to door that would void listing", responseType: "pass_fail_na", codeReference: "NFPA 80 §5.2.1.3", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Field modification detected — door listing may be voided" } },
        ],
      },
      {
        title: "Hold-Open & Release Devices",
        items: [
          { itemCode: "HO.1", questionText: "No unauthorized hold-open devices (wedges, chains, furniture) present", responseType: "pass_fail_na", codeReference: "NFPA 80 §5.2.1.3.5", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Unauthorized hold-open device found — immediate removal required" } },
          { itemCode: "HO.2", questionText: "Listed magnetic hold-open releases door on fire alarm signal (if present)", responseType: "pass_fail_na", isRequired: false, codeReference: "NFPA 80 §5.2.1.3.5 / NFPA 72", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Hold-open device did not release on fire alarm signal" } },
        ],
      },
    ],
  },

  // ─── NFPA 25 — Sprinkler Monthly / Quarterly Visual ─────────────────────────
  {
    name: "NFPA 25 — Sprinkler Monthly Visual Inspection",
    description: "Monthly visual inspection of wet pipe sprinkler systems per NFPA 25 Table 5.1. Quick check of control valves, gauges, and general system condition.",
    systemType: "sprinkler",
    inspectionType: "monthly",
    frequency: "monthly",
    defaultAssignmentSystemType: "sprinkler",
    defaultAssignmentJobType: "monthly",
    sections: [
      {
        title: "Control Valves",
        items: [
          { itemCode: "CV.1", questionText: "All control valves fully open and properly supervised", responseType: "pass_fail_na", codeReference: "NFPA 25 Table 5.1", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Control valve closed or not supervised — immediate impairment" } },
        ],
      },
      {
        title: "Gauges",
        items: [
          { itemCode: "GA.1", questionText: "System pressure reading (PSI/kPa)", responseType: "pressure_reading", codeReference: "NFPA 25 Table 5.1" },
          { itemCode: "GA.2", questionText: "Pressure within normal range", responseType: "pass_fail_na", codeReference: "NFPA 25 §13.2.2", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "System pressure outside normal range" } },
        ],
      },
      {
        title: "General Visual",
        items: [
          { itemCode: "GV.1", questionText: "No visible leaks on pipes, fittings, or sprinkler heads", responseType: "pass_fail_na", codeReference: "NFPA 25 Table 5.1", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Active leak observed on sprinkler system" } },
          { itemCode: "GV.2", questionText: "No changes to storage or occupancy that would affect sprinkler coverage", responseType: "pass_fail_na", codeReference: "NFPA 25 §5.1", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Occupancy or storage change may impact sprinkler coverage" }, helpText: "Look for new high-piled storage, rack storage, or partitions near sprinklers." },
          { itemCode: "GV.3", questionText: "Sprinkler system room/area accessible and no new hazards introduced", responseType: "pass_fail_na" },
          { itemCode: "GV.4", questionText: "Notes / observations", responseType: "text", isRequired: false },
        ],
      },
    ],
  },

  // ─── NFPA 72 — Fire Alarm Quarterly Inspection ───────────────────────────────
  {
    name: "NFPA 72 — Fire Alarm Quarterly Inspection",
    description: "Quarterly inspection of fire alarm systems per NFPA 72. Covers FACP status check, battery condition, and visual inspection of devices. Not a substitute for the annual functional test.",
    systemType: "fire_alarm",
    inspectionType: "quarterly",
    frequency: "quarterly",
    defaultAssignmentSystemType: "fire_alarm",
    defaultAssignmentJobType: "quarterly",
    sections: [
      {
        title: "Control Equipment",
        items: [
          { itemCode: "CE.1", questionText: "FACP is free of trouble conditions", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.2", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "FACP has active trouble condition" } },
          { itemCode: "CE.2", questionText: "FACP is free of alarm conditions (no unreported alarm)", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.2", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Unreported alarm condition found on FACP" } },
          { itemCode: "CE.3", questionText: "FACP lamps/LEDs functional", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.2", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "FACP indicator lamp/LED failure" } },
        ],
      },
      {
        title: "Power Supply",
        items: [
          { itemCode: "PS.1", questionText: "Primary AC power present", responseType: "pass_fail_na", codeReference: "NFPA 72 §10.5.3", deficiencyTrigger: { onValues: ["fail"], severity: "critical", defaultTitle: "Primary AC power absent" } },
          { itemCode: "PS.2", questionText: "Batteries — no visible swelling, cracking, or leakage", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.4", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Battery physical defect observed" } },
        ],
      },
      {
        title: "Visual Device Inspection",
        items: [
          { itemCode: "VD.1", questionText: "Spot check of smoke detectors — no damage, paint, or obstruction (sample basis)", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.5", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Smoke detector obstructed, painted, or damaged" } },
          { itemCode: "VD.2", questionText: "Manual pull stations visually inspected — no physical damage", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.7", deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "Manual pull station physically damaged" } },
          { itemCode: "VD.3", questionText: "Notification appliances visually inspected — no damage or obstruction", responseType: "pass_fail_na", codeReference: "NFPA 72 §14.4.9", deficiencyTrigger: { onValues: ["fail"], severity: "minor", defaultTitle: "Notification appliance damaged or obstructed" } },
          { itemCode: "VD.4", questionText: "Notes / observations", responseType: "text", isRequired: false },
        ],
      },
    ],
  },

];

// ─── Insertion logic ───────────────────────────────────────────────────────────

async function run() {
  console.log(`\n📋 NFPA Template Seeder — company ${companyId}${dryRun ? " [DRY RUN]" : ""}\n`);

  // Fetch existing template names to skip duplicates
  const existing = await db
    .select({ name: schema.inspectionTemplates.name })
    .from(schema.inspectionTemplates)
    .where(schema.inspectionTemplates.companyId ? eq(schema.inspectionTemplates.companyId, companyId) : undefined as any);
  const existingNames = new Set(existing.map((t) => t.name));

  let inserted = 0;
  let skipped = 0;

  for (const tpl of TEMPLATES) {
    if (existingNames.has(tpl.name)) {
      console.log(`  ⏭  Skip (exists): ${tpl.name}`);
      skipped++;
      continue;
    }

    console.log(`  ➕ Creating: ${tpl.name}`);
    if (dryRun) { inserted++; continue; }

    // Insert template
    const [tplResult] = await db.insert(schema.inspectionTemplates).values({
      companyId,
      name: tpl.name,
      description: tpl.description,
      systemType: tpl.systemType,
      inspectionType: tpl.inspectionType,
      frequency: tpl.frequency,
      status: "active",
      isDefault: 1,
    });
    const templateId = tplResult.insertId;

    // Insert sections + items
    let sectionOrder = 0;
    for (const sec of tpl.sections) {
      const [secResult] = await db.insert(schema.inspectionTemplateSections).values({
        companyId,
        templateId,
        title: sec.title,
        description: sec.description ?? null,
        sortOrder: sectionOrder++,
        isRequired: 1,
      });
      const sectionId = secResult.insertId;

      let itemOrder = 0;
      for (const item of sec.items) {
        await db.insert(schema.inspectionTemplateItems).values({
          companyId,
          templateId,
          sectionId,
          itemCode: item.itemCode ?? null,
          questionText: item.questionText,
          helpText: item.helpText ?? null,
          responseType: item.responseType,
          isRequired: item.isRequired !== false ? 1 : 0,
          sortOrder: itemOrder++,
          codeReference: item.codeReference ?? null,
          deficiencyTrigger: item.deficiencyTrigger ? JSON.stringify(item.deficiencyTrigger) : null,
          options: item.options ? JSON.stringify(item.options) : null,
        });
      }
    }

    // Default assignment (system-type level, no site/customer specifics)
    if (tpl.defaultAssignmentSystemType || tpl.defaultAssignmentJobType) {
      await db.insert(schema.inspectionTemplateAssignments).values({
        companyId,
        templateId,
        systemType: tpl.defaultAssignmentSystemType ?? null,
        jobType: tpl.defaultAssignmentJobType ?? null,
        siteId: null,
        customerOrgId: null,
        isActive: 1,
      });
    }

    const totalItems = tpl.sections.reduce((s, sec) => s + sec.items.length, 0);
    console.log(`     ✓ ${tpl.sections.length} sections, ${totalItems} items`);
    inserted++;
  }

  console.log(`\n✅ Done — ${inserted} template(s) created, ${skipped} skipped.\n`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
