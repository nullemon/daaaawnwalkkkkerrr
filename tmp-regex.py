import io

B = chr(92)
p = 'src/lib/entity-links.test.ts'
s = io.open(p, encoding='utf-8').read()

old = (
    "    for (const match of source.matchAll(/name:" + B + B + "s*'([a-zA-Z]["
    + B + B + "w]*)',[" + B + B + "s" + B + B + "S]{0,400}?type:"
    + B + B + "s*'relationship'/g)) {"
)
assert old in s, 'regex anchor not found'

new_lines = [
    "    /*",
    "      No intervening `name:`, or the match spans two fields and pairs one",
    "      field's name with the next field's type — which is how `romanceable`,",
    "      a checkbox three fields earlier, first came back as a relationship.",
    "    */",
    "    const pattern =",
    "      /name:" + B + B + "s*'([a-zA-Z][" + B + B + "w]*)',(?:(?!name:)["
    + B + B + "s" + B + B + "S]){0,400}?type:" + B + B + "s*'relationship'/g",
    "    for (const match of source.matchAll(pattern)) {",
]

s = s.replace(old, '\n'.join(new_lines), 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('regex tightened')
