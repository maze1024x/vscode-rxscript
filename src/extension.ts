// NOTE
//
// The implementation of autocomplete and hover is temporary thus pretty ad hoc,
// to be refactored (along with the ad hoc index generator).

import * as vscode from 'vscode'
import * as path from 'path'
import * as Parser from 'web-tree-sitter'
import { BuiltinRawIndex } from './builtin'

let GetParser = (async () => {
    await Parser.init()
    const parser = new Parser()
    const Lang = await Parser.Language.load(path.join(__dirname, '..', 'node_modules', 'tree-sitter-rxscript', 'tree-sitter-rxscript.wasm'))
    parser.setLanguage(Lang)
    // console.log(Lang)
    // console.log(parser.parse('namespace ::').rootNode.toString())
    return parser
})()

let BuiltinHintMapping: { [key: string]: string } = {}
let BuiltinItems: vscode.CompletionItem[] = []

export function activate(ctx: vscode.ExtensionContext): void {
    let keywords = ['const', 'if', 'else', 'when', 'each', 'let', 'new', 'namespace', 'using', 'entry', 'type', 'function', 'operator', 'method', 'native', 'record', 'interface', 'union', 'enum', 'variadic']
    let is_keyword = keywords.reduce((h,k) => (h[k] = true, h), {} as { [key:string]: boolean })
    let legend = new vscode.SemanticTokensLegend(['keyword', 'class', 'function', 'property', 'number', 'string', 'constant'])
    ctx.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider('rxscript', {
            async provideDocumentSemanticTokens(document, token): Promise<vscode.SemanticTokens> {
                let parser = await GetParser
                let buf = new vscode.SemanticTokensBuilder(legend)
                let code = document.getText()
                let tree = parser.parse(code)
                function span(node: Parser.SyntaxNode): vscode.Range {
                    let start = new vscode.Position(node.startPosition.row, node.startPosition.column)
                    let end = new vscode.Position(node.endPosition.row, node.endPosition.column)
                    let range = new vscode.Range(start, end)
                    return range
                }
                function find(node: Parser.SyntaxNode, t: string): Parser.SyntaxNode | null {
                    for (let i = 0; i < node.childCount; i += 1) {
                        let child = node.children[i]
                        if (child.type == t) {
                            return child
                        }
                    }
                    return null
                }
                function traverse(node: Parser.SyntaxNode) {
                    if (!(node.isNamed()) && is_keyword[node.type]) {
                        buf.push(span(node), 'keyword')
                    }
                    if (node.parent) {
                        let parent = node.parent
                        if (parent.type == 'binding_cps') {
                        if (node.type == '@' || node.type == 'ref') {
                            buf.push(span(node), 'keyword')
                        }}
                        if (node.type == 'name') {
                            if (parent.type == 'decl_type') {
                                buf.push(span(node), 'class')
                            }
                            if (parent.type == 'decl_func') {
                                buf.push(span(node), 'function')
                            }
                            if (parent.type == 'decl_const') {
                                buf.push(span(node), 'constant')
                            }
                            if (parent.type == 'type_params') {
                                buf.push(span(node), 'class')
                            }
                            if (parent.type == 'field') {
                                buf.push(span(node), 'property')
                            }
                            if (parent.type == 'pipe_get') {
                                buf.push(span(node), 'property')
                            }
                            if (parent.type == 'method') {
                                buf.push(span(node), 'property')
                            }
                            if (parent.type == 'case') {
                                buf.push(span(node), 'class')
                            }
                            if (parent.type == 'enum_item') {
                                buf.push(span(node), 'class')
                            }
                        }
                        if (node.type == 'decl_method') {
                            let recv = find(node, 'receiver'); if (recv) {
                            let name = find(node, 'name'); if (name) {
                                buf.push(span(recv).union(span(name)), 'property')
                            }}
                        }
                        if (['byte','char','float','int'].indexOf(node.type) != -1) {
                            buf.push(span(node), 'number')
                        }
                        if (node.type == 'text') {
                            buf.push(span(node), 'string')
                        }
                        if (parent.parent && parent.parent.type == 'type') {
                        if (parent.type == 'ref') {
                        if (node.type == 'ref_base') {
                            buf.push(span(node), 'class')
                        }}}
                        if (node.type == 'expr') {
                            let t = find(node, 'term'); if (t) {
                            let rt = find(t, 'ref_term'); if (rt) {
                            let ref = find(rt, 'ref'); if (ref) {
                            let base = find(ref, 'ref_base'); if (base) {
                                if (find(rt, 'new')) {
                                    buf.push(span(base), 'class')
                                } else {
                                    let p = find(node, 'pipe'); if (p) {
                                        if (find(p, 'pipe_call')) {
                                            buf.push(span(base), 'function')
                                        }
                                    }
                                }
                            }}}}
                        }
                        if (node.type == 'pipe_infix') {
                            let ref = find(node, 'ref'); if (ref) {
                            let base = find(ref, 'ref_base'); if (base) {
                                buf.push(span(base), 'function')
                            }}
                        }
                        if (node.type == 'infix_term') {
                            let ref = find(node, 'ref'); if (ref) {
                            let base = find(ref, 'ref_base'); if (base) {
                                buf.push(span(base), 'function')
                            }}
                        }
                    }
                    for (let i = 0; i < node.childCount; i += 1) {
                        traverse(node.children[i])
                    }
                }
                traverse(tree.rootNode)
                return buf.build()
            },
        }, legend)
    )
    ctx.subscriptions.push(
        vscode.languages.registerCompletionItemProvider('rxscript', {
            provideCompletionItems(document, position, token, context): vscode.CompletionItem[] {
                let range = document.getWordRangeAtPosition(position)
                let word = document.getText(range)
                let item_match_word = (item: vscode.CompletionItem): boolean => {
                    return (item.label.toString().toLowerCase().startsWith(word.toLowerCase()))
                }
                if (context.triggerKind == vscode.CompletionTriggerKind.TriggerCharacter) {
                    if (context.triggerCharacter == '.') {
                        return BuiltinItems.filter(item =>
                            (item.kind == vscode.CompletionItemKind.Field
                            || item.kind == vscode.CompletionItemKind.Method)
                        )
                    } else {
                        return BuiltinItems.filter(item =>
                            (item.kind == vscode.CompletionItemKind.Operator)
                        ).map(item => ({        
                            ...item,
                            insertText: (" " + item.label.toString())
                        }))
                    }
                } else {
                    return BuiltinItems.filter(item =>
                        (item.kind == vscode.CompletionItemKind.Function
                        || item.kind == vscode.CompletionItemKind.Constant
                        || item.kind == vscode.CompletionItemKind.Class
                        || item.kind == vscode.CompletionItemKind.EnumMember
                        ) && item_match_word(item)
                    )
                }
            }
        }, '.', '|')
    )
    ctx.subscriptions.push(
        vscode.languages.registerHoverProvider('rxscript', {
            provideHover(document, position, token): vscode.Hover {
                let range = document.getWordRangeAtPosition(position)
                let word = document.getText(range)
                let hint = BuiltinHintMapping[word]
                if (hint) {
                    return new vscode.Hover(new vscode.MarkdownString("```\n" + hint + "\n```"))
                } else {
                    return null as unknown as vscode.Hover
                }
            },
        })
    )
}

export function deactivate() {}

if (BuiltinRawIndex.ns == "") {
    let index: { [key:string]: vscode.CompletionItem & {hint:string} } = {}
    let add = (kind: string, name: string, item: vscode.CompletionItem & {hint:string}) => {
        if (name.length >= 3 && name.startsWith('<') && name.endsWith('>')) {
            return
        }
        let key = (kind + "@" + name)
        if (index[key]) {
            let detail = index[key].detail
            let hint = index[key].hint
            if (item.detail) {
                index[key].detail = ((detail? detail+", ": "") + item.detail)
            }
            if (item.hint) {
                index[key].hint = ((hint? hint+"\n": "") + item.hint)
            }
        } else {
            index[key] = item
        }
    }
    for (let item of BuiltinRawIndex.items) {
        let kind = item[0] as string
        if (kind == "type") {
            let [_, name, def] = item
            def = def.replace(/<[0-9A-Za-z]+> +[^,}]+/g, t => '[undocumented]' + (t.endsWith(' ')? ' ': t.endsWith('\n')? '\n': ''))
            if (def.match(/<[0-9A-Za-z]+>/)) { def = '[undocumented]' } // workaround for inner undocumented type
            let hint = (name + " type :: " + def)
            add(kind, name, {
                kind: vscode.CompletionItemKind.Class, // as "Type"
                label: name,
                hint: hint
            })
        } else if (kind == "function") {
            let [_, name, ret, sig] = item
            let hint = sig.startsWith("[")? (name + sig): (name + " " + sig)
            add(kind, name, {
                kind: vscode.CompletionItemKind.Function,
                label: name,
                detail: ret,
                hint: hint,
            })
        } else if (kind == "operator") {
            let [_, name, ret, sig] = item
            let hint = (name.match(/[0-9A-Za-z]$/) && sig.startsWith("["))? (name + sig): (name + " " + sig)
            add(kind, name, {
                kind: vscode.CompletionItemKind.Operator,
                label: name,
                detail: ret,
                hint: hint,
            })
        } else if (kind == "method" || kind == "abstract-method") {
            let [_, name, type] = item
            add(kind, name, {
                kind: vscode.CompletionItemKind.Method,
                label: name,
                detail: type,
                hint: "",
            })
        } else if (kind == "const") {
            let [_, name, type] = item
            add(kind, name, {
                kind: vscode.CompletionItemKind.Constant,
                label: name,
                detail: type,
                hint: type
            })
        } else if (kind == "enum-value") {
            let [_, name, type] = item
            add(kind, name, {
                kind: vscode.CompletionItemKind.EnumMember,
                label: name,
                detail: type,
                hint: ""
            })
        } else if (kind == "field") {
            let [_, name, type] = item
            add(kind, name, {
                kind: vscode.CompletionItemKind.Field,
                label: name,
                detail: type,
                hint: ""
            })
        }
    }
    for (let [key, item] of Object.entries(index)) {
        if (item.hint) {
            let [_, name] = key.split("@")
            let v = BuiltinHintMapping[name]
            BuiltinHintMapping[name] = (v? v+"\n": "") + item.hint
        }
        BuiltinItems.push(item)
    }
}
