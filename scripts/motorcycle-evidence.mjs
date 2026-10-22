// Keep affirmative vehicle classes while discarding exclusions within a class label.
export function vehicleEvidenceParts(label){
 const negative=/未確認|未确认|尚未|対象外|不可|禁止|対応していません|ではありません|ではない|意味しません|○ではない|不扩展|不表示|不自动扩展|確定としていません|除く|除外/;
 const normalized=String(label||'').normalize('NFKC');
 // "原付(50cc以下・...大型バイクを除く)" still affirms 50cc mopeds.
 const cleaned=normalized.replace(/\(([^()]*)\)/g,(_,body)=>'('+body.split(/[・、]/).filter(part=>!/(?:除く|除外)/.test(part)).join('・')+')');
 return cleaned.split(/[。；;\n]/).map(s=>s.trim()).filter(s=>s&&!negative.test(s));
}
