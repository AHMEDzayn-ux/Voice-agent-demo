"use strict";

const units = new Map(Object.entries({
  බිංදුව: 0, බින්දුව: 0, zero: 0, එක: 1, දෙක: 2, තුන: 3, හතර: 4,
  පහ: 5, හය: 6, හත: 7, අට: 8, නවය: 9, නමය: 9,
}));
const tens = new Map(Object.entries({ විසි: 20, තිස්: 30, හතළිස්: 40, හතලිස්: 40, පනස්: 50, හැට: 60, හැත්තෑ: 70, අසූ: 80, අනූ: 90 }));
const hundreds = new Map(Object.entries({ එකසිය: 100, දෙසිය: 200, තුන්සිය: 300, හාරසිය: 400, පන්සිය: 500, හයසිය: 600, හත්සිය: 700, අටසිය: 800, නවසිය: 900 }));
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
    const hundred = hundreds.get(word);
    if (hundred !== undefined) index++;
    const ten = tens.get(words[index]);
    if (ten !== undefined && unit(words[index + 1]) > 0) {
      result += String((hundred || 0) + ten + unit(words[++index]));
      continue;
    }
    const value = unit(words[index]) ?? wholeNumbers.get(words[index]?.replace(ending, ""));
    if (value === undefined || (hundred !== undefined && value >= 100)) return null;
    result += String((hundred || 0) + value);
  }
  return result.length > 0 && result.length <= 128 ? result : null;
}

module.exports = { readDictatedDigits };
