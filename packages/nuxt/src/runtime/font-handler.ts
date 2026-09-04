import { defineEventHandler, toWebRequest } from "h3";
import { glyphs } from "./engine.js";

export default defineEventHandler(async (event) =>
  (await glyphs).engine.fontResponse(toWebRequest(event)),
);
