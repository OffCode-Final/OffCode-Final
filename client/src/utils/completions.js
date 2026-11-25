/**
 * Per-language keyword/snippet completions and room-wide identifier completion source.
 */
import { snippetCompletion, completeAnyWord } from '@codemirror/autocomplete'

const snip = (label, template, detail = 'snippet') =>
  snippetCompletion(template, { label, type: 'keyword', detail })

const kw = (label, type = 'keyword') => ({ label, type })

const PYTHON_COMPLETIONS = [
  snip('def', 'def ${name}(${params}):\n    ${pass}', 'function'),
  snip('class', 'class ${ClassName}:\n    def __init__(self${, params}):\n        ${pass}', 'class'),
  snip('for', 'for ${item} in ${iterable}:\n    ${pass}', 'loop'),
  snip('while', 'while ${condition}:\n    ${pass}', 'loop'),
  snip('if', 'if ${condition}:\n    ${pass}', 'branch'),
  snip('elif', 'elif ${condition}:\n    ${pass}', 'branch'),
  snip('else', 'else:\n    ${pass}', 'branch'),
  snip('if __name__', 'if __name__ == "__main__":\n    ${main()}', 'entrypoint'),
  snip('with open', 'with open("${file}", "${r}") as ${f}:\n    ${content = f.read()}', 'context'),
  snip('try/except', 'try:\n    ${pass}\nexcept ${Exception} as ${e}:\n    ${print(e)}', 'exception'),
  snip('lambda', 'lambda ${x}: ${x}', 'expression'),
  snip('f-string', 'f"${text} {${expr}}"', 'string'),
  snip('list comp', '[${x} for ${x} in ${iterable}]', 'comprehension'),
  snip('dict comp', '{${k}: ${v} for ${k}, ${v} in ${items}}', 'comprehension'),
  kw('print', 'function'),
  kw('input', 'function'),
  kw('len', 'function'),
  kw('range', 'function'),
  kw('enumerate', 'function'),
  kw('zip', 'function'),
  kw('sorted', 'function'),
  kw('isinstance', 'function'),
  kw('return'),
  kw('import'),
  kw('from'),
  kw('async'),
  kw('await'),
  kw('True', 'constant'),
  kw('False', 'constant'),
  kw('None', 'constant')
]

const JS_COMPLETIONS = [
  snip('console.log', 'console.log(${value});', 'log'),
  snip('console.error', 'console.error(${err});', 'log'),
  snip('function', 'function ${name}(${params}) {\n  ${}\n}', 'function'),
  snip('arrow function', 'const ${name} = (${params}) => {\n  ${}\n};', 'function'),
  snip('async function', 'async function ${name}(${params}) {\n  ${}\n}', 'async'),
  snip('fetch', 'const ${res} = await fetch("${url}");\nconst ${data} = await ${res}.json();', 'network'),
  snip('map', '${arr}.map((${item}) => ${item})', 'array'),
  snip('filter', '${arr}.filter((${item}) => ${condition})', 'array'),
  snip('reduce', '${arr}.reduce((${acc}, ${item}) => ${acc}, ${0})', 'array'),
  snip('for', 'for (let ${i} = 0; ${i} < ${len}; ${i}++) {\n  ${}\n}', 'loop'),
  snip('for...of', 'for (const ${item} of ${iterable}) {\n  ${}\n}', 'loop'),
  snip('if', 'if (${condition}) {\n  ${}\n}', 'branch'),
  snip('try/catch', 'try {\n  ${}\n} catch (${err}) {\n  console.error(${err});\n}', 'exception'),
  snip('class', 'class ${Name} {\n  constructor(${params}) {\n    ${}\n  }\n}', 'class'),
  snip('Promise', 'new Promise((resolve, reject) => {\n  ${}\n})', 'async'),
  snip('setTimeout', 'setTimeout(() => {\n  ${}\n}, ${1000});', 'timer'),
  kw('const'),
  kw('let'),
  kw('return'),
  kw('export'),
  kw('import'),
  kw('await'),
  kw('async'),
  kw('typeof'),
  kw('null', 'constant'),
  kw('undefined', 'constant')
]

const TS_COMPLETIONS = [
  ...JS_COMPLETIONS,
  snip('interface', 'interface ${Name} {\n  ${prop}: ${string};\n}', 'type'),
  snip('type', 'type ${Name} = ${string};', 'type'),
  snip('enum', 'enum ${Name} {\n  ${First} = "${FIRST}",\n}', 'type'),
  snip('generics', 'function ${identity}<${T}>(value: ${T}): ${T} {\n  return value;\n}', 'generic'),
  snip('Record', 'Record<${string}, ${unknown}>', 'utility'),
  kw('implements'),
  kw('readonly'),
  kw('keyof'),
  kw('as'),
  kw('unknown', 'type'),
  kw('never', 'type')
]

const GO_COMPLETIONS = [
  snip('func', 'func ${name}(${params}) ${error} {\n\t${}\n}', 'function'),
  snip('func main', 'func main() {\n\t${fmt.Println("Hello")}\n}', 'entrypoint'),
  snip('for range', 'for ${i}, ${v} := range ${items} {\n\t${}\n}', 'loop'),
  snip('for', 'for ${i} := 0; ${i} < ${n}; ${i}++ {\n\t${}\n}', 'loop'),
  snip('if err != nil', 'if err != nil {\n\treturn ${err}\n}', 'error check'),
  snip('if', 'if ${condition} {\n\t${}\n}', 'branch'),
  snip('fmt.Println', 'fmt.Println(${value})', 'print'),
  snip('fmt.Printf', 'fmt.Printf("${%v\\n}", ${value})', 'print'),
  snip('struct', 'type ${Name} struct {\n\t${Field} ${string}\n}', 'type'),
  snip('interface', 'type ${Name} interface {\n\t${Method}() ${error}\n}', 'type'),
  snip('switch', 'switch ${expr} {\ncase ${val}:\n\t${}\ndefault:\n\t${}\n}', 'branch'),
  snip('goroutine', 'go func() {\n\t${}\n}()', 'concurrency'),
  snip('defer', 'defer ${fn()}', 'defer'),
  kw('package'),
  kw('import'),
  kw('var'),
  kw('const'),
  kw('return'),
  kw('make', 'function'),
  kw('len', 'function'),
  kw('append', 'function'),
  kw('nil', 'constant'),
  kw('true', 'constant'),
  kw('false', 'constant'),
  kw('string', 'type'),
  kw('int', 'type'),
  kw('bool', 'type'),
  kw('error', 'type')
]

const RUST_COMPLETIONS = [
  snippetCompletion('fn main() {\n    ${println!("Hello, world!");}\n}', { label: 'fn main', type: 'keyword', detail: 'entrypoint', boost: 2 }),
  snip('fn', 'fn ${name}(${params}) -> ${()} {\n    ${}\n}', 'function'),
  snip('println!', 'println!("${{}}", ${value});', 'macro'),
  snip('format!', 'format!("${{}}", ${value})', 'macro'),
  snip('let mut', 'let mut ${name} = ${value};', 'binding'),
  snip('let', 'let ${name} = ${value};', 'binding'),
  snip('match', 'match ${expr} {\n    ${pattern} => ${expr},\n    _ => ${()},\n}', 'pattern'),
  snip('impl', 'impl ${Type} {\n    pub fn ${new}() -> Self {\n        ${}\n    }\n}', 'impl'),
  snip('struct', 'struct ${Name} {\n    ${field}: ${String},\n}', 'type'),
  snip('enum', 'enum ${Name} {\n    ${Variant},\n}', 'type'),
  snip('for', 'for ${item} in ${iter} {\n    ${}\n}', 'loop'),
  snip('if let', 'if let ${Some(val)} = ${opt} {\n    ${}\n}', 'branch'),
  snip('vec!', 'vec![${1, 2, 3}]', 'macro'),
  kw('pub'),
  kw('use'),
  kw('mod'),
  kw('crate'),
  kw('self'),
  kw('mut'),
  kw('async'),
  kw('await'),
  kw('Option', 'type'),
  kw('Result', 'type'),
  kw('Some', 'constant'),
  kw('None', 'constant'),
  kw('Ok', 'constant'),
  kw('Err', 'constant'),
  kw('String', 'type')
]

const RUBY_COMPLETIONS = [
  snippetCompletion('def ${name}(${params})\n  ${}\nend', { label: 'def method', type: 'keyword', detail: 'method', boost: 2 }),
  snip('def', 'def ${name}(${params})\n  ${}\nend', 'method'),
  snip('class', 'class ${Name}\n  def initialize(${params})\n    ${}\n  end\nend', 'class'),
  snip('each do', '${items}.each do |${item}|\n  ${puts item}\nend', 'iterator'),
  snip('map do', '${items}.map do |${item}|\n  ${item}\nend', 'iterator'),
  snip('if', 'if ${condition}\n  ${}\nend', 'branch'),
  snip('unless', 'unless ${condition}\n  ${}\nend', 'branch'),
  snip('begin/rescue', 'begin\n  ${}\nrescue => ${e}\n  puts ${e.message}\nend', 'exception'),
  snip('puts', 'puts ${value}', 'output'),
  snip('module', 'module ${Name}\n  ${}\nend', 'module'),
  kw('require'),
  kw('require_relative'),
  kw('attr_accessor'),
  kw('attr_reader'),
  kw('elsif'),
  kw('else'),
  kw('while'),
  kw('return'),
  kw('yield'),
  kw('nil', 'constant'),
  kw('true', 'constant'),
  kw('false', 'constant'),
  kw('self')
]

const PHP_COMPLETIONS = [
  snip('<?php', '<?php\n\n${}\n', 'tag'),
  snip('echo', 'echo ${$value} . "\\n";', 'output'),
  snip('function', 'function ${name}(${$param}) {\n    ${return $param;}\n}', 'function'),
  snip('foreach', 'foreach (${$items} as ${$item}) {\n    ${}\n}', 'loop'),
  snip('for', 'for (${$i} = 0; ${$i} < ${$n}; ${$i}++) {\n    ${}\n}', 'loop'),
  snip('class', 'class ${Name} {\n    public function __construct(${$arg}) {\n        ${}\n    }\n}', 'class'),
  snip('if', 'if (${$condition}) {\n    ${}\n}', 'branch'),
  snip('try/catch', 'try {\n    ${}\n} catch (Exception ${$e}) {\n    echo ${$e}->getMessage();\n}', 'exception'),
  snip('array', '[${"key"} => ${"value"}]', 'array'),
  kw('public'),
  kw('private'),
  kw('protected'),
  kw('static'),
  kw('return'),
  kw('namespace'),
  kw('use'),
  kw('require_once'),
  kw('var_dump', 'function'),
  kw('count', 'function'),
  kw('null', 'constant'),
  kw('true', 'constant'),
  kw('false', 'constant')
]

const JAVA_COMPLETIONS = [
  snip('public static void main', 'public static void main(String[] args) {\n    ${System.out.println("Hello");}\n}', 'entrypoint'),
  snip('System.out.println', 'System.out.println(${value});', 'output'),
  snip('for', 'for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n    ${}\n}', 'loop'),
  snip('for-each', 'for (${String} ${item} : ${items}) {\n    ${}\n}', 'loop'),
  snip('class', 'public class ${Main} {\n    ${}\n}', 'class'),
  snip('interface', 'public interface ${Name} {\n    ${void method();} \n}', 'interface'),
  snip('if', 'if (${condition}) {\n    ${}\n}', 'branch'),
  snip('try/catch', 'try {\n    ${}\n} catch (Exception ${e}) {\n    ${e.printStackTrace();}\n}', 'exception'),
  snip('ArrayList', 'List<${String}> ${list} = new ArrayList<>();', 'collection'),
  snip('HashMap', 'Map<${String}, ${Integer}> ${map} = new HashMap<>();', 'collection'),
  kw('public'),
  kw('private'),
  kw('protected'),
  kw('static'),
  kw('final'),
  kw('void', 'type'),
  kw('int', 'type'),
  kw('double', 'type'),
  kw('boolean', 'type'),
  kw('String', 'type'),
  kw('return'),
  kw('import'),
  kw('new'),
  kw('null', 'constant'),
  kw('true', 'constant'),
  kw('false', 'constant')
]

const C_COMPLETIONS = [
  snip('#include <stdio.h>', '#include <stdio.h>', 'header'),
  snip('#include <stdlib.h>', '#include <stdlib.h>', 'header'),
  snip('#include <string.h>', '#include <string.h>', 'header'),
  snip('int main', 'int main(void) {\n    ${printf("Hello\\n");}\n    return 0;\n}', 'entrypoint'),
  snip('printf', 'printf("${%s\\n}", ${value});', 'output'),
  snip('scanf', 'scanf("${%d}", &${var});', 'input'),
  snip('for', 'for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n    ${}\n}', 'loop'),
  snip('while', 'while (${condition}) {\n    ${}\n}', 'loop'),
  snip('if', 'if (${condition}) {\n    ${}\n}', 'branch'),
  snip('struct', 'typedef struct {\n    ${int x;}\n} ${Name};', 'type'),
  snip('malloc', '(${type} *)malloc(sizeof(${type}) * ${n})', 'memory'),
  kw('int', 'type'),
  kw('char', 'type'),
  kw('float', 'type'),
  kw('double', 'type'),
  kw('void', 'type'),
  kw('size_t', 'type'),
  kw('const'),
  kw('return'),
  kw('sizeof'),
  kw('NULL', 'constant')
]

const CPP_COMPLETIONS = [
  snip('#include <iostream>', '#include <iostream>', 'header'),
  snip('#include <vector>', '#include <vector>', 'header'),
  snip('#include <string>', '#include <string>', 'header'),
  snip('int main', 'int main() {\n    ${std::cout << "Hello\\n";}\n    return 0;\n}', 'entrypoint'),
  snip('std::cout', 'std::cout << ${value} << "\\n";', 'output'),
  snip('std::cin', 'std::cin >> ${var};', 'input'),
  snip('vector', 'std::vector<${int}> ${vec};', 'container'),
  snip('for', 'for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n    ${}\n}', 'loop'),
  snip('for-range', 'for (const auto& ${item} : ${items}) {\n    ${}\n}', 'loop'),
  snip('class', 'class ${Name} {\npublic:\n    ${Name}() {}\n};', 'class'),
  snip('if', 'if (${condition}) {\n    ${}\n}', 'branch'),
  snip('struct', 'struct ${Name} {\n    ${int x;}\n};', 'type'),
  kw('using namespace std;'),
  kw('auto'),
  kw('const'),
  kw('constexpr'),
  kw('nullptr', 'constant'),
  kw('std::string', 'type'),
  kw('std::map', 'type'),
  kw('return'),
  kw('template'),
  kw('typename'),
  kw('public'),
  kw('private')
]

const HTML_COMPLETIONS = [
  snip('html:5', '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${Document}</title>\n</head>\n<body>\n  ${}\n</body>\n</html>', 'boilerplate'),
  snip('div', '<div>${}</div>', 'element'),
  snip('span', '<span>${}</span>', 'element'),
  snip('button', '<button type="button">${Click}</button>', 'element'),
  snip('script', '<script>\n  ${}\n</script>', 'element'),
  snip('script src', '<script src="${script.js}"></script>', 'element'),
  snip('link css', '<link rel="stylesheet" href="${style.css}">', 'element'),
  snip('input', '<input type="${text}" placeholder="${}">', 'element'),
  snip('a', '<a href="${#}">${Link}</a>', 'element'),
  snip('ul', '<ul>\n  <li>${Item}</li>\n</ul>', 'element'),
  snip('p', '<p>${}</p>', 'element'),
  snip('h1', '<h1>${}</h1>', 'element'),
  snip('h2', '<h2>${}</h2>', 'element'),
  snip('section', '<section>\n  ${}\n</section>', 'element'),
  snip('form', '<form>\n  ${}\n</form>', 'element'),
  snip('img', '<img src="${}" alt="${}">', 'element'),
  kw('class=""', 'property'),
  kw('id=""', 'property'),
  kw('style=""', 'property'),
  kw('aria-label=""', 'property')
]

const CSS_COMPLETIONS = [
  snip('flex-center', 'display: flex;\nalign-items: center;\njustify-content: center;', 'layout'),
  snip('grid', 'display: grid;\ngrid-template-columns: repeat(${3}, 1fr);\ngap: ${12px};', 'layout'),
  snip('media', '@media (max-width: ${768px}) {\n  ${}\n}', 'media query'),
  snip('var', 'var(--${token})', 'function'),
  kw('display'),
  kw('flex-direction'),
  kw('align-items'),
  kw('justify-content'),
  kw('gap'),
  kw('padding'),
  kw('margin'),
  kw('background-color'),
  kw('color'),
  kw('border'),
  kw('border-radius'),
  kw('font-size'),
  kw('font-weight'),
  kw('position'),
  kw('width'),
  kw('height'),
  kw('transition')
]

const JSON_COMPLETIONS = [
  snip('object', '{\n  "${key}": "${value}"\n}', 'object'),
  snip('array', '[\n  "${item}"\n]', 'array'),
  snip('pair', '"${key}": "${value}"', 'property'),
  kw('true', 'constant'),
  kw('false', 'constant'),
  kw('null', 'constant')
]

const MD_COMPLETIONS = [
  snip('code block', '```${js}\n${}\n```', 'block'),
  snip('link', '[${text}](${url})', 'link'),
  snip('image', '![${alt}](${url})', 'image'),
  snip('table', '| ${Col 1} | ${Col 2} |\n| --- | --- |\n| ${Val 1} | ${Val 2} |', 'table'),
  snip('task', '- [ ] ${Task}', 'list'),
  snip('heading', '## ${Heading}', 'heading'),
  snip('quote', '> ${Quote}', 'quote'),
  kw('---', 'keyword')
]

const LANGUAGE_COMPLETIONS = {
  py: PYTHON_COMPLETIONS,
  js: JS_COMPLETIONS,
  jsx: JS_COMPLETIONS,
  mjs: JS_COMPLETIONS,
  ts: TS_COMPLETIONS,
  tsx: TS_COMPLETIONS,
  go: GO_COMPLETIONS,
  rs: RUST_COMPLETIONS,
  rb: RUBY_COMPLETIONS,
  php: PHP_COMPLETIONS,
  java: JAVA_COMPLETIONS,
  c: C_COMPLETIONS,
  h: C_COMPLETIONS,
  cpp: CPP_COMPLETIONS,
  hpp: CPP_COMPLETIONS,
  cc: CPP_COMPLETIONS,
  cxx: CPP_COMPLETIONS,
  html: HTML_COMPLETIONS,
  htm: HTML_COMPLETIONS,
  css: CSS_COMPLETIONS,
  json: JSON_COMPLETIONS,
  md: MD_COMPLETIONS,
  markdown: MD_COMPLETIONS
}

const MAX_ROOM_WORDS = 5000

/**
 * Collects unique identifiers from other open room files, bounded to 5,000 words.
 */
export function collectRoomIdentifiers(openFiles, activeFile, getFileText) {
  const words = new Set()
  if (!Array.isArray(openFiles) || typeof getFileText !== 'function') return []

  for (const name of openFiles) {
    if (!name || name === activeFile) continue
    const text = getFileText(name)
    if (!text) continue
    const matches = text.match(/[A-Za-z_$][A-Za-z0-9_$]{1,48}/g)
    if (!matches) continue
    for (const w of matches) {
      words.add(w)
      if (words.size >= MAX_ROOM_WORDS) {
        return Array.from(words, (label) => ({ label, type: 'text', boost: -10 }))
      }
    }
  }
  return Array.from(words, (label) => ({ label, type: 'text', boost: -10 }))
}

/**
 * Creates CodeMirror CompletionSources combining per-language snippets/keywords,
 * current-file words (completeAnyWord), and other open room files' identifiers.
 */
export function createLanguageCompletionSources(ext, getRoomCompletions) {
  const langList = LANGUAGE_COMPLETIONS[ext] || []

  const langSource = (context) => {
    if (langList.length === 0) return null
    const word = context.matchBefore(/[<#]\??[A-Za-z_$][\w$!.:-]*|[A-Za-z_$][\w$!.:-]*/)
    if (!word && !context.explicit) return null

    const from = word ? word.from : context.pos
    const typedText = word ? word.text : ''
    const cleanFrom = typedText.startsWith('<') && !typedText.startsWith('<?') ? from + 1 : from
    if (cleanFrom === context.pos && !context.explicit) return null

    return {
      from: cleanFrom,
      options: langList,
      validFor: /^[#?A-Za-z0-9_$!.:-]*$/
    }
  }

  const roomWordsSource = (context) => {
    if (typeof getRoomCompletions !== 'function') return null
    const word = context.matchBefore(/[A-Za-z_$][A-Za-z0-9_$]*/)
    if (!word && !context.explicit) return null
    const roomOpts = getRoomCompletions()
    if (!Array.isArray(roomOpts) || roomOpts.length === 0) return null
    return {
      from: word ? word.from : context.pos,
      options: roomOpts,
      validFor: /^[A-Za-z0-9_$]*$/
    }
  }

  return [langSource, completeAnyWord, roomWordsSource]
}
