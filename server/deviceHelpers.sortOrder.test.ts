import { describe, it, expect } from "vitest";
import { sortByWalkOrderThenLocation } from "../shared/deviceHelpers";

// Locks that the device grid replicates the imported workbook (source) order
// via sortOrder, and that walk order still wins once a walk is in progress.
describe("sortByWalkOrderThenLocation — source-order tiebreak", () => {
  it("orders un-walked devices by imported sortOrder, not alphabetical location", () => {
    const devices = [
      { id: 3, location: "Zebra Rm", sortOrder: 1, walkOrder: null },
      { id: 1, location: "Attic", sortOrder: 2, walkOrder: null },
      { id: 2, location: "Middle", sortOrder: 3, walkOrder: null },
    ];
    // Alphabetical would be Attic, Middle, Zebra; source order is 3,1,2.
    expect(sortByWalkOrderThenLocation(devices).map((d) => d.id)).toEqual([3, 1, 2]);
  });

  it("walk order takes precedence over source order", () => {
    const devices = [
      { id: 1, location: "A", sortOrder: 1, walkOrder: 2 },
      { id: 2, location: "B", sortOrder: 2, walkOrder: 1 },
    ];
    expect(sortByWalkOrderThenLocation(devices).map((d) => d.id)).toEqual([2, 1]);
  });

  it("devices without sortOrder fall to the end, then sort by location", () => {
    const devices = [
      { id: 1, location: "Yankee", sortOrder: null, walkOrder: null },
      { id: 2, location: "Alpha", sortOrder: null, walkOrder: null },
      { id: 3, location: "Has order", sortOrder: 5, walkOrder: null },
    ];
    // #3 (has sortOrder) first; the two null-sortOrder ones then by location.
    expect(sortByWalkOrderThenLocation(devices).map((d) => d.id)).toEqual([3, 2, 1]);
  });
});
