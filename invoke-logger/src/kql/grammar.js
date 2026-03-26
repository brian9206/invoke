// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }

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
  WILDCARD: /[a-zA-Z0-9_\-\.\/]*[*?][a-zA-Z0-9_\-\.\/]*(?:[*?][a-zA-Z0-9_\-\.\/]*)*/,
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
var grammar = {
    Lexer: lexer,
    ParserRules: [
    {"name": "query", "symbols": ["_", "expr", "_"], "postprocess": d => d[1]},
    {"name": "expr", "symbols": ["orExpr"], "postprocess": d => d[0]},
    {"name": "orExpr$ebnf$1", "symbols": []},
    {"name": "orExpr$ebnf$1$subexpression$1", "symbols": ["_", "_OR", "_", "andExpr"]},
    {"name": "orExpr$ebnf$1", "symbols": ["orExpr$ebnf$1", "orExpr$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "orExpr", "symbols": ["andExpr", "orExpr$ebnf$1"], "postprocess": ([first, rest]) => rest.reduce((acc, item) => ({ type: "OR", left: acc, right: item[3] }), first)},
    {"name": "andExpr$ebnf$1", "symbols": []},
    {"name": "andExpr$ebnf$1$subexpression$1", "symbols": ["_", "_AND", "_", "notExpr"]},
    {"name": "andExpr$ebnf$1", "symbols": ["andExpr$ebnf$1", "andExpr$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "andExpr", "symbols": ["notExpr", "andExpr$ebnf$1"], "postprocess": ([first, rest]) => rest.reduce((acc, item) => ({ type: "AND", left: acc, right: item[3] }), first)},
    {"name": "notExpr", "symbols": ["_NOT", "_", "notExpr"], "postprocess": ([, , e]) => ({ type: "NOT", expr: e })},
    {"name": "notExpr", "symbols": ["primary"], "postprocess": d => d[0]},
    {"name": "primary", "symbols": ["term"], "postprocess": d => d[0]},
    {"name": "primary", "symbols": ["bareValue"], "postprocess": d => d[0]},
    {"name": "primary", "symbols": ["_LPAREN", "_", "expr", "_RPAREN"], "postprocess": ([, , e]) => e},
    {"name": "term", "symbols": ["field", "_", "_COLON", "_", "value"], "postprocess": ([f, , , , v]) => ({ type: "TERM", field: f, value: v })},
    {"name": "term", "symbols": ["field", "_", "comparator", "_", "compValue"], "postprocess": ([f, , op, , v]) => ({ type: "COMPARE", field: f, op: op, value: v })},
    {"name": "bareValue", "symbols": ["_WILDCARD"], "postprocess": d => ({ type: "BARE", value: { type: "wildcard", value: d[0] } })},
    {"name": "bareValue", "symbols": ["_QUOTED"], "postprocess": d => ({ type: "BARE", value: stripQuotes(d[0]) })},
    {"name": "bareValue", "symbols": ["_WORD"], "postprocess": d => ({ type: "BARE", value: d[0] })},
    {"name": "bareValue", "symbols": ["_KEYWORD"], "postprocess": d => ({ type: "BARE", value: d[0] })},
    {"name": "field", "symbols": ["_WORD"], "postprocess": d => d[0]},
    {"name": "field", "symbols": ["_KEYWORD"], "postprocess": d => d[0]},
    {"name": "value", "symbols": ["_WILDCARD"], "postprocess": d => ({ type: "wildcard", value: d[0] })},
    {"name": "value", "symbols": ["_QUOTED"], "postprocess": d => stripQuotes(d[0])},
    {"name": "value", "symbols": ["_NUMBER"], "postprocess": d => parseFloat(d[0])},
    {"name": "value", "symbols": ["_WORD"], "postprocess": d => d[0]},
    {"name": "value", "symbols": ["_KEYWORD"], "postprocess": d => d[0]},
    {"name": "comparator", "symbols": ["_GTE"], "postprocess": d => d[0]},
    {"name": "comparator", "symbols": ["_LTE"], "postprocess": d => d[0]},
    {"name": "comparator", "symbols": ["_GT"], "postprocess": d => d[0]},
    {"name": "comparator", "symbols": ["_LT"], "postprocess": d => d[0]},
    {"name": "compValue", "symbols": ["_NUMBER"], "postprocess": d => parseFloat(d[0])},
    {"name": "compValue", "symbols": ["_QUOTED"], "postprocess": d => stripQuotes(d[0])},
    {"name": "compValue", "symbols": ["_WORD"], "postprocess": d => d[0]},
    {"name": "compValue", "symbols": ["_KEYWORD"], "postprocess": d => d[0]},
    {"name": "_AND", "symbols": [(lexer.has("AND") ? {type: "AND"} : AND)], "postprocess": d => d[0].value.toUpperCase()},
    {"name": "_OR", "symbols": [(lexer.has("OR") ? {type: "OR"} : OR)], "postprocess": d => d[0].value.toUpperCase()},
    {"name": "_NOT", "symbols": [(lexer.has("NOT") ? {type: "NOT"} : NOT)], "postprocess": d => d[0].value.toUpperCase()},
    {"name": "_KEYWORD", "symbols": [(lexer.has("AND") ? {type: "AND"} : AND)], "postprocess": d => d[0].value},
    {"name": "_KEYWORD", "symbols": [(lexer.has("OR") ? {type: "OR"} : OR)], "postprocess": d => d[0].value},
    {"name": "_KEYWORD", "symbols": [(lexer.has("NOT") ? {type: "NOT"} : NOT)], "postprocess": d => d[0].value},
    {"name": "_COLON", "symbols": [(lexer.has("COLON") ? {type: "COLON"} : COLON)], "postprocess": d => d[0].value},
    {"name": "_LPAREN", "symbols": [(lexer.has("LPAREN") ? {type: "LPAREN"} : LPAREN)], "postprocess": d => d[0].value},
    {"name": "_RPAREN", "symbols": [(lexer.has("RPAREN") ? {type: "RPAREN"} : RPAREN)], "postprocess": d => d[0].value},
    {"name": "_WORD", "symbols": [(lexer.has("WORD") ? {type: "WORD"} : WORD)], "postprocess": d => d[0].value},
    {"name": "_QUOTED", "symbols": [(lexer.has("QUOTED") ? {type: "QUOTED"} : QUOTED)], "postprocess": d => d[0].value},
    {"name": "_WILDCARD", "symbols": [(lexer.has("WILDCARD") ? {type: "WILDCARD"} : WILDCARD)], "postprocess": d => d[0].value},
    {"name": "_GTE", "symbols": [(lexer.has("GTE") ? {type: "GTE"} : GTE)], "postprocess": d => d[0].value},
    {"name": "_LTE", "symbols": [(lexer.has("LTE") ? {type: "LTE"} : LTE)], "postprocess": d => d[0].value},
    {"name": "_GT", "symbols": [(lexer.has("GT") ? {type: "GT"} : GT)], "postprocess": d => d[0].value},
    {"name": "_LT", "symbols": [(lexer.has("LT") ? {type: "LT"} : LT)], "postprocess": d => d[0].value},
    {"name": "_NUMBER", "symbols": [(lexer.has("NUMBER") ? {type: "NUMBER"} : NUMBER)], "postprocess": d => d[0].value},
    {"name": "_$ebnf$1", "symbols": []},
    {"name": "_$ebnf$1", "symbols": ["_$ebnf$1", (lexer.has("WS") ? {type: "WS"} : WS)], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "_", "symbols": ["_$ebnf$1"]}
]
  , ParserStart: "query"
}
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
