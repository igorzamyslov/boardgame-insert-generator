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
  it("leaves out the settings and printer fields, which are all on screen", () => {
    const list = [
      err("/settings/bottomChamfer"),
      err("/settings/lip/ledge"),
      err("/printer/bedMargin"),
      err("/printer/layerHeight"),
    ];
    expect(errorsWithoutField(list)).toEqual([]);
  });

  it("keeps lock errors, the project id and the component limit", () => {
    const list = [err("/locks/0", "invalid.lock"), err("/id", "invalid.id"), err("/components")];
    expect(errorsWithoutField(list)).toEqual(list);
  });

  it("keeps errors without a path", () => {
    const list = [err(undefined)];
    expect(errorsWithoutField(list)).toEqual(list);
  });

  it("leaves out fields that are on screen, warnings and info", () => {
    const warning: Notice = { level: "warning", code: "x", message: "m", path: "/locks/0" };
    const list = [err("/box/innerWidth"), err("/components/0/decks/0/count"), warning];
    expect(errorsWithoutField(list)).toEqual([]);
  });
});
