import re

file_path = r'c:\Projects\SeeNotes\uni\kb-template.json'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the corrupted placeholders: __PLACEHOLDER_<b><i>...</i></b>__ -> <b><i>...</i></b>
content = re.sub(r"__PLACEHOLDER_(.*?)__", r"\1", content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed placeholders")
