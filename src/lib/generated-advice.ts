import type { HomeSummary } from "./home-insights";
import type { FallbackReason } from "./insight-diagnostics";

export const ACTIONS = ["ventilate", "ventilate_then_heat", "heat", "check_sources", "reduce_heat", "monitor", "check_sensors"] as const;
export type Action = typeof ACTIONS[number];
export type GeneratedAdvice = { schemaVersion: 2; insightId: string; room: string; action: Action; text: string };
export type AdviceOption = { insightId: string; room: string; name: string; action: Action; cold: boolean; humid: boolean; persistent: boolean; rising: boolean; drierOutside: boolean };

// Only the engine determines which room/action pairs the model may explain.
export function adviceOptions(home: HomeSummary): AdviceOption[] {
  return home.candidates.flatMap(candidate => {
    if (candidate.id === "coverage") return [{ insightId: candidate.id, room: "home", name: "home", action: "check_sensors" as Action, cold: false, humid: false, persistent: false, rising: false, drierOutside: false }];
    return home.summary.rooms.filter(r => r.available && (
      candidate.id === "sustained" ? r.risk === "High Risk" :
      candidate.id === "humidity" ? r.humid :
      candidate.id === "cold" ? r.cold :
      candidate.id === "warm" ? r.reading!.temperature > r.comfort.maxTemperature :
      candidate.id === "dry" ? r.reading!.humidity < r.comfort.minHumidity :
      candidate.id === "rising" ? (r.trend.humidity ?? 0) >= 5 :
      candidate.id === "condensation" ? r.risk === "Moderate Risk" : candidate.id === "comfortable"
    )).map(r => ({
      insightId: candidate.id, room: r.ref, name: r.name,
      action: (r.ventilationSuitable ? r.cold ? "ventilate_then_heat" : "ventilate" : r.cold ? "heat" :
        candidate.id === "warm" ? "reduce_heat" : ["sustained", "humidity", "rising", "condensation"].includes(candidate.id) ? "check_sources" : "monitor") as Action,
      cold: r.cold, humid: r.humid, persistent: r.risk === "High Risk", rising: (r.trend.humidity ?? 0) >= 5,
      drierOutside: r.ventilationSuitable,
    }));
  });
}

export function isAdviceShape(value: unknown): value is GeneratedAdvice {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).sort().join() === "action,insightId,room,schemaVersion,text" && v.schemaVersion === 2 &&
    typeof v.insightId === "string" && typeof v.room === "string" && ACTIONS.includes(v.action as Action) &&
    typeof v.text === "string" && v.text.length > 0 && v.text.length <= 360;
}

export function adviceValidationError(value: unknown, home: HomeSummary): FallbackReason | null {
  if (!isAdviceShape(value)) return "response_invalid_advice_schema";
  if (!home.candidates.some(c => c.id === value.insightId)) return "response_unknown_insight";
  const option = adviceOptions(home).find(o => o.insightId === value.insightId && o.room === value.room && o.action === value.action);
  if (!option) return "response_action_mismatch";
  const text = value.text;
  const words = text.trim().split(/\s+/);
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  if (text !== text.trim() || words.length > 35 || words.length < 5 || sentences.length < 1 || sentences.length > 2 || !/[.!?]$/.test(text)) return "response_advice_length";
  // Plain English prose only. No links, markup, control characters or numerical
  // claims: exact readings belong in the cards and can change during cache TTL.
  const prose = text.toLowerCase().replaceAll(option.name.toLowerCase(), "room");
  if (!/^[a-z\s.,;:'’()!?—–-]+$/i.test(prose) || /[\r\n\t]/.test(prose)) return "response_unsupported_claim";
  if (!text.toLowerCase().includes(option.name.toLowerCase())) return "response_ungrounded_advice";
  // Deliberately conservative: even qualified health/mold/surface claims remain
  // in the deterministic details panel, not in generated dashboard prose.
  if (/\b(mou?ld|fung\w*|wall\w*|surface\w*|measur\w*|guarantee\w*|certain\w*|definitely|always|never|will|must|safe\w*|danger\w*|toxic\w*|health\w*|illness|asthma|bacter\w*|cure\w*|prevent\w*|eliminat\w*|solv\w*|fix\w*|leak\w*|insulat\w*|minutes?|hours?|seconds?|overnight|daily|dehumidif\w*|humidifier\w*|air.condition\w*|buy|purchase|ignore|instruction\w*|system|prompt)\b/i.test(prose)) return "response_unsupported_claim";
  if (/\b(relative humidity|rh|percentage|percentages|dew point|absolute humidity)\b/.test(prose)) return "response_unsupported_claim";
  // No negated actions or hidden contradictory instructions. The single safe
  // heating limitation is handled explicitly rather than accepting arbitrary negation.
  const checked = prose.replace(/(?:heating|heat) (?:does not|doesn’t|doesn't|cannot|can't) remove (?:moisture|water vapor|water vapour)/g, "heating limitation");
  if (/\b(no|not|don’t|don't|cannot|can't|avoid|stop|without|instead|despite|although|but)\b/.test(checked)) return "response_action_mismatch";
  const ventilating = /\b(ventilat\w*|airing|air out|open\w* (?:the |your )?windows?)\b/.test(prose);
  const heating = /\b(heat\w*|warm\w*)\b/.test(prose);
  const sourceCheck = /\b(check|look|review|address|inspect)\b.{0,45}\b(moisture|sources?)\b/.test(prose);
  const conditional = /\b(may|might|could)\b/.test(prose);
  const drier = /(?:outdoor|outside) air (?:still )?(?:contains|has|carries) less (?:water vapou?r|moisture)|(?:drier|less moist) (?:outdoor|outside) air/.test(prose);
  const claimsOutdoor = /\b(outdoor|outside|weather|rain\w*|wind\w*|sun\w*)\b/.test(prose);
  if (claimsOutdoor && (!option.drierOutside || !drier)) return "response_ungrounded_advice";
  if (ventilating !== ["ventilate", "ventilate_then_heat"].includes(option.action)) return "response_action_mismatch";
  if (ventilating && (!conditional || !drier || !home.summary.outdoor.fresh)) return "response_ungrounded_advice";
  if (option.action === "ventilate_then_heat" && (!heating || !/\b(then|after|follow\w*)\b/.test(prose))) return "response_action_mismatch";
  if (heating && !["ventilate_then_heat", "heat", "reduce_heat"].includes(option.action)) return "response_action_mismatch";
  if (option.action === "heat" && (!heating || !/heating limitation/.test(checked) || !conditional)) return "response_action_mismatch";
  if (option.action === "reduce_heat" && !/\b(reduce|limit|lower)\b.{0,30}\bheat/.test(prose)) return "response_action_mismatch";
  if ((option.action === "check_sources" || option.persistent || (option.action === "heat" && option.humid)) && !sourceCheck) return "response_action_mismatch";
  if (option.persistent && !/\b(persistent|persistently|sustained|stayed|remains)\b/.test(prose)) return "response_ungrounded_advice";
  if (!option.persistent && /\b(persistent|persistently|sustained|stayed)\b/.test(prose)) return "response_ungrounded_advice";
  if (!option.cold && /\b(cold|cool|chilly|colder|cooler)\b/.test(prose)) return "response_ungrounded_advice";
  if (!option.rising && /\b(rising|risen|increas\w*)\b/.test(prose)) return "response_ungrounded_advice";
  if (option.action === "check_sensors" && !/\b(check|review)\b.{0,30}\bsensors?\b/.test(prose)) return "response_action_mismatch";
  if (option.action === "monitor" && !/\b(monitor|watch|routine|track|check)\b/.test(prose)) return "response_action_mismatch";
  // Heating must never be described as moisture removal, even as a possibility.
  if (/\b(heat\w*|warm\w*)\b.{0,45}\b(remov\w*|dry\w*|moisture reduction|reduc\w* (?:the )?(?:moisture|water))/.test(checked)) return "response_unsupported_claim";
  if (option.insightId !== "comfortable" && /\b(optimal|comfortable|normal|fine|perfect)\b/.test(prose)) return "response_ungrounded_advice";
  return null;
}

export function validateAdvice(value: unknown, home: HomeSummary): GeneratedAdvice | null {
  return adviceValidationError(value, home) === null ? { ...(value as GeneratedAdvice) } : null;
}

export function adviceSchema(home: HomeSummary) {
  const options = adviceOptions(home);
  return { type: "object", additionalProperties: false, required: ["schemaVersion", "insightId", "room", "action", "text"], properties: {
    schemaVersion: { type: "integer", enum: [2] }, insightId: { type: "string", enum: home.candidates.map(c => c.id) },
    room: { type: "string", enum: [...new Set(options.map(o => o.room))] }, action: { type: "string", enum: [...new Set(options.map(o => o.action))] },
    text: { type: "string", minLength: 20, maxLength: 360 },
  } };
}
