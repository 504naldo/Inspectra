/** Parse exact decimal units; never silently round estimating inputs. */
export function estimateUnits(value: string, places: number): number {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(value))
    throw new Error(
      `Use a nonnegative amount with at most ${places} decimal places`
    );
  const [whole, fraction = ""] = value.split(".");
  const result =
    Number(whole) * 10 ** places + Number(fraction.padEnd(places, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Amount is too large");
  return result;
}
