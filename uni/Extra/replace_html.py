import json, re
with open('lang/i18n-en.json', 'r', encoding='utf-8') as f:
    i18n = json.load(f)

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# We will use regex to find data-key, but we will find the closing tag by balancing.
def replace_data_keys(html_str):
    idx = 0
    out = ''
    while True:
        match = re.search(r'(<([a-zA-Z0-9]+)[^>]*data-key="([^"]+)"[^>]*>)', html_str[idx:])
        if not match:
            out += html_str[idx:]
            break
        start_pos = idx + match.start()
        end_open_tag = idx + match.end()
        tag_name = match.group(2)
        key = match.group(3)
        
        out += html_str[idx:start_pos]
        out += match.group(1) # The opening tag
        
        # Find the matching closing tag
        nesting = 1
        curr = end_open_tag
        while nesting > 0 and curr < len(html_str):
            next_open = html_str.find(f'<{tag_name}', curr)
            next_close = html_str.find(f'</{tag_name}>', curr)
            
            if next_close == -1:
                break
            
            if next_open != -1 and next_open < next_close:
                nesting += 1
                curr = next_open + 1
            else:
                nesting -= 1
                curr = next_close + 1
        
        end_pos = curr - 1
        closing_tag_pos = html_str.rfind(f'</{tag_name}>', end_open_tag, end_pos + len(f'</{tag_name}>'))
        if closing_tag_pos == -1:
            closing_tag_pos = end_pos
            
        inner_html = html_str[end_open_tag:closing_tag_pos]
        closing_tag = html_str[closing_tag_pos:closing_tag_pos + len(f'</{tag_name}>')]
        
        if key in i18n:
            # Do the replacement if it contains Cyrillic
            if bool(re.search(r'[А-Яа-я]', inner_html)):
                if '<svg' in inner_html or '<i class' in inner_html or '<img' in inner_html:
                    # Keep the icon, replace the text
                    icon_match = re.search(r'^\s*(<svg[\s\S]*?</svg>|<i[^>]*></i>|<img[^>]*>)', inner_html)
                    if icon_match:
                        inner_html = '\n                            ' + icon_match.group(1) + '\n                            ' + i18n[key] + '\n                        '
                    else:
                        inner_html = i18n[key]
                else:
                    # Replace entirely
                    inner_html = i18n[key]
        
        out += inner_html + closing_tag
        idx = closing_tag_pos + len(closing_tag)
    return out

new_html = replace_data_keys(html)
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(new_html)
print('Replaced with English successfully.')
