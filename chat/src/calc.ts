// Evaluates arithmetic: + - * / ^ %, brackets and decimals. Never uses eval.

export function calculate(expression: string): number {
  const src = expression.replace(/[×x]/g, "*").replace(/÷/g, "/").replace(/(\d),(?=\d{3}\b)/g, "$1");
  let pos = 0;

  const peek = () => {
    while (src[pos] === " ") pos++;
    return src[pos];
  };
  const fail = (msg: string): never => {
    throw new Error(`${msg} at position ${pos + 1} in "${expression}"`);
  };

  function number(): number {
    peek();
    const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(pos));
    if (!m) fail("Expected a number");
    pos += m![0].length;
    return Number(m![0]);
  }

  function primary(): number {
    const c = peek();
    if (c === "(") {
      pos++;
      const v = sum();
      if (peek() !== ")") fail("Expected )");
      pos++;
      return v;
    }
    if (c === "-") { pos++; return -primary(); }
    if (c === "+") { pos++; return primary(); }
    return number();
  }

  function power(): number {
    const base = primary();
    if (peek() === "^") { pos++; return base ** power(); }
    return base;
  }

  function product(): number {
    let v = power();
    for (let c = peek(); c === "*" || c === "/" || c === "%"; c = peek()) {
      pos++;
      const r = power();
      v = c === "*" ? v * r : c === "/" ? v / r : v % r;
    }
    return v;
  }

  function sum(): number {
    let v = product();
    for (let c = peek(); c === "+" || c === "-"; c = peek()) {
      pos++;
      const r = product();
      v = c === "+" ? v + r : v - r;
    }
    return v;
  }

  const result = sum();
  if (peek() !== undefined) fail("Unexpected character");
  if (!Number.isFinite(result)) throw new Error(`The result of "${expression}" is not a finite number`);
  return result;
}
