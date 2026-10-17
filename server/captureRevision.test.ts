import { expect, it } from "vitest";
import { createCaptureRevision } from "./captureRevision";
it("revisions ignore object key order while binding displayed data and order", () => {
  const original = createCaptureRevision("template-question", { text: "Original", options: ["Yes", "No"] });
  expect(createCaptureRevision("template-question", { options: ["Yes", "No"], text: "Original" })).toBe(original);
  expect(createCaptureRevision("template-question", { text: "Changed", options: ["Yes", "No"] })).not.toBe(original);
  expect(createCaptureRevision("template-question", { text: "Original", options: ["No", "Yes"] })).not.toBe(original);
  expect(createCaptureRevision("fire-alarm-question", { text: "Original", options: ["Yes", "No"] })).not.toBe(original);
});
