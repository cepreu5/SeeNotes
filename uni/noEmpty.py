import sys
import re

def process_file(input_file, output_file):
    # Засичаме function (вкл. async function)
    func_pattern = re.compile(r'\bfunction\b')
    # Засичаме arrow function: => {
    arrow_pattern = re.compile(r'=>\s*{')

    in_function = False
    brace_count = 0

    with open(input_file, "r", encoding="utf-8") as fin, \
         open(output_file, "w", encoding="utf-8") as fout:

        for line in fin:
            stripped = line.strip()

            if not in_function:
                # Засичаме декларация на функция или arrow function
                if func_pattern.search(line) or arrow_pattern.search(line):
                    in_function = True
                    brace_count = line.count("{") - line.count("}")
                    fout.write(line)
                else:
                    fout.write(line)
            else:
                # махаме празните редове вътре
                if stripped:
                    fout.write(line)

                # броим скобите
                brace_count += line.count("{")
                brace_count -= line.count("}")

                if brace_count <= 0:
                    in_function = False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python noEmpty.py <input_file> <output_file>")
        sys.exit(1)

    process_file(sys.argv[1], sys.argv[2])
