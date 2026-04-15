/**
 * ולידציית מספר תעודת זהות ישראלית (ספרת ביקורת)
 * @param {string|number} id
 * @returns {boolean}
 */
function isValidIsraeliID(id) {
  if (!id) return false;

  id = String(id).replace(/\D/g, "");
  if (id.length > 9 || id.length < 5) return false;

  id = id.padStart(9, "0");

  let sum = 0;

  for (let i = 0; i < 9; i++) {
    let num = Number(id[i]) * ((i % 2) + 1);
    if (num > 9) num = Math.floor(num / 10) + (num % 10);
    sum += num;
  }

  return sum % 10 === 0;
}

if (typeof window !== "undefined") {
  window.isValidIsraeliID = isValidIsraeliID;
}
