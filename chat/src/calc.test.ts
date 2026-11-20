import { expect, test } from "bun:test";
import { calculate } from "./calc";

test("the exercise's multiplication", () => {
  expect(calculate("3557 * 4289")).toBe(15255973);
  expect(calculate("3557 × 4289")).toBe(15255973);
  expect(calculate("3,557 x 4,289")).toBe(15255973);
});

test("precedence, brackets and powers", () => {
  expect(calculate("2 + 3 * 4")).toBe(14);
  expect(calculate("(2 + 3) * 4")).toBe(20);
  expect(calculate("2 ^ 3 ^ 2")).toBe(512);
  expect(calculate("-2 ^ 2")).toBe(4);
  expect(calculate("10 % 4 + 7 / 2")).toBe(5.5);
});

test("rejects anything that isn't arithmetic", () => {
  expect(() => calculate("process.exit()")).toThrow();
  expect(() => calculate("2 +")).toThrow();
  expect(() => calculate("1 / 0")).toThrow();
});
