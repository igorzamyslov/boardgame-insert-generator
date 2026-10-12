// src/ui/validation.test.ts
import { describe, expect, it } from "vitest";
import type { Notice } from "../model/types";
import { errorsWithoutField } from "./validation";

const err = (path: string | undefined, code = "field.setting"): Notice => ({
  level: "error",
  code,
  message: `Problem at ${path ?? "nowhere"}`,
  ...(path !== undefined && { path }),
});

describe("errorsWithoutField", () => {
  it("keeps the errors of settings that simple mode hides, not advanced ones", () => {
    const list = [err("/settings/bottomChamfer"), err("/settings/lip/ledge")];
    expect(errorsWithoutField(list, false)).toEqual(list);
    expect(errorsWithoutField(list, true)).toEqual([]);
  });

  it("keeps lock errors, the project id and the component limit in both modes", () => {
    const list = [err("/locks/0", "invalid.lock"), err("/id", "invalid.id"), err("/components")];
    expect(errorsWithoutField(list, true)).toEqual(list);
    expect(errorsWithoutField(list, false)).toEqual(list);
  });

  it("keeps errors without a path and the printer fields only advanced mode shows", () => {
    const list = [err(undefined), err("/printer/bedMargin"), err("/printer/layerHeight")];
    expect(errorsWithoutField(list, true)).toEqual([list[0]]);
    expect(errorsWithoutField(list, false)).toEqual(list);
  });

  it("leaves out fields that are on screen, warnings and info", () => {
    const warning: Notice = { level: "warning", code: "x", message: "m", path: "/locks/0" };
    const list = [err("/box/innerWidth"), err("/components/0/decks/0/count"), warning];
    expect(errorsWithoutField(list, false)).toEqual([]);
  });
});
