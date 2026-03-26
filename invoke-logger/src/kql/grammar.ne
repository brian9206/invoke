@{%
const moo = require("moo");

function stripQuotes(value) {
  if (!value || value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

const lexer = moo.compile({
  WS:       { match: /[ \t\n\r]+/, lineBreaks: true },
  GTE:      ">=",
  LTE:      "<=",
  GT:       ">",
  LT:       "<",
  LPAREN:   "(",
  RPAREN:   ")",
  COLON:    ":",
  QUOTED:   /"(?:\\["\\]|[^\n"\\])*"|'(?:\\['\\]|[^\n'\\])*'/,
  WILDCARD: /\*+|\?+|[a-zA-Z0-9_\-\.\/]*[*?][a-zA-Z0-9_\-\.\/]*(?:[*?][a-zA-Z0-9_\-\.\/]*)*/,
  NUMBER:   /[0-9]+(?:\.[0-9]+)?/,
  WORD: {
    match: /[a-zA-Z0-9_\-\.\/]+/,
    type: moo.keywords({
      AND: ["AND", "and", "And"],
      OR: ["OR", "or", "Or"],
      NOT: ["NOT", "not", "Not"]
    })
  }
});
%}

@lexer lexer

query -> _ expr _ {% d => d[1] %}

expr -> orExpr {% d => d[0] %}

orExpr -> andExpr (_ _OR _ andExpr):* {% ([first, rest]) => rest.reduce((acc, item) => ({ type: "OR", left: acc, right: item[3] }), first) %}

andExpr -> notExpr (_ _AND _ notExpr):* {% ([first, rest]) => rest.reduce((acc, item) => ({ type: "AND", left: acc, right: item[3] }), first) %}

notExpr -> _NOT _ notExpr {% ([, , e]) => ({ type: "NOT", expr: e }) %}
         | primary {% d => d[0] %}

primary -> term {% d => d[0] %}
         | bareValue {% d => d[0] %}
         | _LPAREN _ expr _RPAREN {% ([, , e]) => e %}

term -> field _ _COLON _ value {% ([f, , , , v]) => ({ type: "TERM", field: f, value: v }) %}
      | field _ comparator _ compValue {% ([f, , op, , v]) => ({ type: "COMPARE", field: f, op: op, value: v }) %}

bareValue -> _WILDCARD  {% d => ({ type: "BARE", value: { type: "wildcard", value: d[0] } }) %}
           | _QUOTED    {% d => ({ type: "BARE", value: stripQuotes(d[0]) }) %}
           | _WORD      {% d => ({ type: "BARE", value: d[0] }) %}
           | _KEYWORD   {% d => ({ type: "BARE", value: d[0] }) %}

field -> _WORD    {% d => d[0] %}
       | _KEYWORD {% d => d[0] %}

value -> _WILDCARD {% d => ({ type: "wildcard", value: d[0] }) %}
       | _QUOTED   {% d => stripQuotes(d[0]) %}
       | _NUMBER   {% d => parseFloat(d[0]) %}
       | _WORD     {% d => d[0] %}
       | _KEYWORD  {% d => d[0] %}

comparator -> _GTE {% d => d[0] %}
            | _LTE {% d => d[0] %}
            | _GT  {% d => d[0] %}
            | _LT  {% d => d[0] %}

compValue -> _NUMBER   {% d => parseFloat(d[0]) %}
           | _QUOTED   {% d => stripQuotes(d[0]) %}
           | _WORD     {% d => d[0] %}
           | _KEYWORD  {% d => d[0] %}

_AND -> %AND {% d => d[0].value.toUpperCase() %}
_OR -> %OR {% d => d[0].value.toUpperCase() %}
_NOT -> %NOT {% d => d[0].value.toUpperCase() %}
_KEYWORD -> %AND {% d => d[0].value %}
          | %OR  {% d => d[0].value %}
          | %NOT {% d => d[0].value %}
_COLON -> %COLON {% d => d[0].value %}
_LPAREN -> %LPAREN {% d => d[0].value %}
_RPAREN -> %RPAREN {% d => d[0].value %}
_WORD -> %WORD {% d => d[0].value %}
_QUOTED -> %QUOTED {% d => d[0].value %}
_WILDCARD -> %WILDCARD {% d => d[0].value %}
_GTE -> %GTE {% d => d[0].value %}
_LTE -> %LTE {% d => d[0].value %}
_GT -> %GT {% d => d[0].value %}
_LT -> %LT {% d => d[0].value %}
_NUMBER -> %NUMBER {% d => d[0].value %}

_ -> %WS:*
