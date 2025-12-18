import sys
import re

def process_file(input_file, output_file):
    func_pattern = re.compile(r'\bfunction\b')
    arrow_pattern = re.compile(r'=>\s*{')

    in_function = False
    brace_count = 0

    total_lines = 0
    removed_blank_lines = 0
    added_blank_lines = 0
    functions_processed = 0

    with open(input_file, "r", encoding="utf-8") as fin, \
         open(output_file, "w", encoding="utf-8") as fout:

        need_blank_after_func = False

        for line in fin:
            total_lines += 1
            stripped = line.strip()

            if not in_function:
                if need_blank_after_func:
                    if stripped:
                        fout.write("\n")  # точно един празен ред
                        added_blank_lines += 1
                        fout.write(line)
                        need_blank_after_func = False
                    else:
                        # пропускаме допълнителните празни редове, но не спираме цикъла
                        removed_blank_lines += 1
                        continue
                else:
                    if func_pattern.search(line) or arrow_pattern.search(line):
                        in_function = True
                        brace_count = line.count("{") - line.count("}")
                        fout.write(line)
                    else:
                        fout.write(line)
            else:
                if stripped:
                    fout.write(line)
                else:
                    removed_blank_lines += 1

                brace_count += line.count("{")
                brace_count -= line.count("}")

                if brace_count <= 0:
                    in_function = False
                    functions_processed += 1
                    need_blank_after_func = True

        # ако файлът свършва след функция → добавяме точно един празен ред
        if need_blank_after_func:
            fout.write("\n")
            added_blank_lines += 1

    print(f"Обработени редове: {total_lines}")
    print(f"Функции обработени: {functions_processed}")
    print(f"Премахнати празни редове: {removed_blank_lines}")
    print(f"Добавени празни редове: {added_blank_lines}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python noEmpty.py <input_file> <output_file>")
        sys.exit(1)

    process_file(sys.argv[1], sys.argv[2])
