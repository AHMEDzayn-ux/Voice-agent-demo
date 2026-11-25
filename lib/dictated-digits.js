"use strict";

const units = new Map(Object.entries({
  බිංදුව: 0, බින්දුව: 0, zero: 0, එක: 1, දෙක: 2, තුන: 3, හතර: 4,
  පහ: 5, හය: 6, හත: 7, අට: 8, නවය: 9, නමය: 9,
}));
const tens = new Map(Object.entries({ විසි: 20, තිස්: 30, හතළිස්: 40, හතලිස්: 40, පනස්: 50, හැට: 60, හැත්තෑ: 70, අසූ: 80, අනූ: 90 }));
const hundreds = new Map(Object.entries({ එකසිය: 100, දෙසිය: 200, තුන්සිය: 300, හාරසිය: 400, පන්සිය: 500, හයසිය: 600, හත්සිය: 700, අටසිය: 800, නවසිය: 900 }));
const thousands = new Map(Object.entries({ එක්: 1000, එක: 1000, දෙ: 2000, තුන්: 3000, හාර: 4000, පන්: 5000, හය: 6000, හත්: 7000, අට: 8000, නව: 9000 }));
const wholeNumbers = new Map(Object.entries({ දහය: 10, විස්ස: 20, තිහ: 30, හතළිහ: 40, පනහ: 50, හැට: 60, හැත්තෑව: 70, අසූව: 80, අනූව: 90, සියය: 100, සීය: 100 }));
const fillers = new Set(["අ", "අහ්", "ආ", "ම්", "යි"]);
const countFirst = new Map([["double", 2], ["triple", 3]]);
const ending = /(?:යි|ක්)$/u;

function unit(word = "") {
  return units.get(word) ?? units.get(word.replace(ending, ""));
}

function readDictatedDigits(text) {
  if (/[^\p{L}\p{M}\d\s.,!?–—-]/u.test(text)) return null;
  const words = text.normalize("NFC").toLowerCase().match(/\d+|[\p{L}\p{M}]+/gu) || [];
  let result = "";
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const next = words[index + 1];
    if (fillers.has(word)) continue;
    if (/^\d+$/.test(word)) {
      result += word;
      continue;
    }
    const repeated = word === "බිංදු" || word === "බින්දු" ? 0
      : /(?:ේම?|ෙන්)$/u.test(word) ? unit(word.replace(/(?:ේම?|ෙන්)$/u, "")) : undefined;
    const count = unit(next);
    if (repeated !== undefined && count >= 2) {
      result += String(repeated).repeat(count);
      index++;
      continue;
    }
    if (countFirst.has(word) && count !== undefined) {
      result += String(count).repeat(countFirst.get(word));
      index++;
      continue;
    }
    const thousand = thousands.get(word.match(/^(.+)(?:දාස්|දහස්)$/u)?.[1]);
    if (thousand !== undefined) index++;
    const hundred = hundreds.get(words[index]);
    if (hundred !== undefined) index++;
    const prefix = (thousand ?? 0) + (hundred ?? 0);
    const tail = words[index] ?? "";
    const ten = tens.get(tail);
    if (ten !== undefined && unit(words[index + 1]) > 0) {
      result += String(prefix + ten + unit(words[++index]));
      continue;
    }
    const writtenTail = prefix && /^[1-9]\d{0,2}$/u.test(tail) ? Number(tail) : undefined;
    const value = writtenTail ?? unit(tail) ?? wholeNumbers.get(tail.replace(ending, ""));
    const limit = hundred !== undefined ? 100 : 1000;
    if (value === undefined || value >= limit) return null;
    result += String(prefix + value);
  }
  return result.length > 0 && result.length <= 128 ? result : null;
}

module.exports = { readDictatedDigits };
